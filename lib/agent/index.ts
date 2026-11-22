import { loadContext } from "@/lib/agent/context";
import { guard } from "@/lib/agent/guard";
import { audit } from "@/lib/agent/audit";
import { toolByName } from "@/lib/agent/tools";
import { failed, type AgentActor, type AgentResult } from "@/lib/agent/types";

/**
 * The only door into the shared agent layer. Every adapter (MCP, in-app
 * Sparklee, the eXp Hub later, HALO / BoldTrail / GHL signals in V1.1) calls
 * this, so the same goal behaves the same from every entry point.
 *
 * Pipeline: identify (done by the adapter's AuthProvider) → load plan, usage,
 * entitlements, brand, My Voice, market, time zone, platforms → guard → tool
 * (plan_spark, approvals, idempotent execution through existing services)
 * → audit → result.
 */
export async function runAgent(o: {
  actor: AgentActor;
  tool: string;
  input?: Record<string, unknown>;
}): Promise<AgentResult> {
  const { actor } = o;
  const input = o.input ?? {};
  const tool = toolByName(o.tool);
  if (!tool) return failed(`Unknown tool: ${o.tool}`, "unknown_tool");

  let result: AgentResult & { audit?: Record<string, unknown> };
  try {
    const ctx = await loadContext(actor.userId);
    const refused = guard(actor, ctx, tool.name, tool.scope);
    result = refused ?? (await tool.run(actor, ctx, input));
  } catch (e) {
    console.error(`[agent] ${o.tool} failed:`, e instanceof Error ? e.message : e);
    result = failed("Something went wrong. Try again in a moment.");
  }

  const extra = (result.audit ?? {}) as Record<string, string | null | undefined>;
  await audit(actor, {
    tool: tool.name,
    result: result.status,
    planId: result.planId ?? (typeof input.planId === "string" ? input.planId : null),
    actionId: result.actionId ?? (typeof input.actionId === "string" ? input.actionId : null),
    requestId: typeof input.requestId === "string" ? input.requestId : null,
    approvalState: (extra.approvalState as never) ?? (result.status === "needs_approval" ? "proposed" : null),
    sparkId: extra.sparkId ?? (typeof input.sparkId === "string" ? input.sparkId : null),
    videoId: extra.videoId ?? (typeof input.videoId === "string" ? input.videoId : null),
    publishRef: extra.publishRef ?? null,
    errorCode: result.status === "ok" || result.status === "needs_approval" ? null : result.code ?? null,
    errorMessage: result.status === "error" || result.status === "denied" ? result.message : null,
    inputSummary: summarizeInput(input),
  });

  const { audit: _omit, ...out } = result;
  void _omit;
  return out;
}

/** A short, safe summary: ids and short fields only, never scripts or secrets. */
function summarizeInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .filter(([k]) => !/token|key|secret|script|message/i.test(k))
    .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v)?.slice(0, 60)}`)
    .join(" ")
    .slice(0, 300);
}
