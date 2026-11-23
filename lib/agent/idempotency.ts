import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentActor } from "@/lib/agent/types";

/**
 * Pipeline step 12: one result per request.
 *
 * Anything that can use a credit, create a video or copy, publish, schedule
 * or (V1.1) send a CRM message claims an agent_actions row BEFORE the core
 * service runs. The row is unique on (user, tool, request_id): a retry finds
 * it and gets the stored result, so it can never make a second video, take a
 * second credit or post twice. The same key with different inputs is refused.
 */

export type ActionKind = "create" | "publish" | "crm_send";

/**
 * The same data always gives the same text, whatever order its keys are in.
 * Postgres jsonb reorders keys when it stores them, so a plain JSON.stringify
 * of a saved plan never matched its hash and every approval would have been
 * refused as "changed" (caught 2026-11-22).
 */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => [k, canonical(o[k])]));
  }
  return v;
}

export const hashPayload = (p: unknown) =>
  createHash("sha256").update(JSON.stringify(canonical(p ?? null))).digest("hex");

/** The client's key, or one derived from the user, tool, inputs and a 10-minute window. */
export function requestIdFor(actor: AgentActor, tool: string, payload: unknown, clientKey?: string | null): string {
  if (clientKey && clientKey.trim()) return clientKey.trim().slice(0, 200);
  const window = Math.floor(Date.now() / 600_000);
  return `auto:${hashPayload([actor.userId, tool, payload, window]).slice(0, 32)}`;
}

export type Claim =
  | { kind: "new"; actionId: string }
  | { kind: "repeat"; actionId: string; status: string; result: unknown }
  | { kind: "conflict"; actionId: string };

export async function claimAction(
  actor: AgentActor,
  o: { tool: string; kind: ActionKind; requestId: string; payload: unknown; planId?: string | null; step?: number | null; status?: "running" | "prepared"; expiresAt?: string | null },
): Promise<Claim> {
  const admin = createAdminClient();
  const payloadHash = hashPayload(o.payload);
  const { data, error } = await admin
    .from("agent_actions")
    .insert({
      user_id: actor.userId,
      connection_id: actor.connectionId,
      kind: o.kind,
      tool: o.tool,
      request_id: o.requestId,
      payload_hash: payloadHash,
      payload: o.payload ?? {},
      status: o.status ?? "running",
      plan_id: o.planId ?? null,
      step: o.step ?? null,
      expires_at: o.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (!error && data) return { kind: "new", actionId: (data as { id: string }).id };

  // Unique conflict: someone (a retry) already claimed this request.
  const { data: existing } = await admin
    .from("agent_actions")
    .select("id, status, result, payload_hash")
    .eq("user_id", actor.userId)
    .eq("tool", o.tool)
    .eq("request_id", o.requestId)
    .maybeSingle();
  const row = existing as { id: string; status: string; result: unknown; payload_hash: string } | null;
  if (!row) throw new Error(error?.message ?? "Couldn't record the action.");
  if (row.payload_hash !== payloadHash) return { kind: "conflict", actionId: row.id };
  return { kind: "repeat", actionId: row.id, status: row.status, result: row.result };
}

export async function finishAction(actionId: string, status: "succeeded" | "failed", result: unknown): Promise<void> {
  await createAdminClient()
    .from("agent_actions")
    .update({ status, result: result ?? null, updated_at: new Date().toISOString() })
    .eq("id", actionId);
}
