import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentActor, AgentStatus } from "@/lib/agent/types";

/**
 * Pipeline step 13: one row per meaningful agent action in agent_audit_log.
 * Never stores tokens, keys or full scripts: input_summary is short.
 * Refusals that look like probing also go to security_events, so they
 * reach the Monday watch email.
 */
export interface AuditEntry {
  tool: string;
  result: AgentStatus;
  requestId?: string | null;
  actionId?: string | null;
  planId?: string | null;
  approvalState?: "not_needed" | "proposed" | "approved" | "confirmed" | "expired" | "cancelled" | null;
  sparkId?: string | null;
  videoId?: string | null;
  publishRef?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  inputSummary?: string | null;
}

const PROBE_CODES = new Set(["scope_missing", "not_in_profile", "not_yours"]);

export async function audit(actor: AgentActor, e: AuditEntry): Promise<void> {
  const admin = createAdminClient();
  try {
    await admin.from("agent_audit_log").insert({
      user_id: actor.userId,
      source: actor.source,
      adapter: actor.adapter,
      connection_id: actor.connectionId,
      tool: e.tool,
      request_id: e.requestId ?? null,
      action_id: e.actionId ?? null,
      plan_id: e.planId ?? null,
      approval_state: e.approvalState ?? null,
      spark_id: e.sparkId ?? null,
      video_id: e.videoId ?? null,
      publish_ref: e.publishRef ?? null,
      result: e.result,
      error_code: e.errorCode ?? null,
      error_message: e.errorMessage?.slice(0, 500) ?? null,
      input_summary: e.inputSummary?.slice(0, 300) ?? null,
    });
    if (e.result === "denied" && e.errorCode && PROBE_CODES.has(e.errorCode)) {
      await admin.from("security_events").insert({
        user_id: actor.userId,
        kind: "agent_denied",
        source: `agent:${actor.adapter}`,
        detail: { tool: e.tool, code: e.errorCode, client: actor.source },
      });
    }
  } catch (err) {
    // An audit failure is logged, never thrown: it must not undo a finished action.
    console.error("[agent/audit] write failed:", err instanceof Error ? err.message : err);
  }
}
