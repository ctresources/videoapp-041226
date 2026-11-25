import type { AgentContext } from "@/lib/agent/context";
import { denied, type Adapter, type AgentActor, type AgentResult, type Scope } from "@/lib/agent/types";

/**
 * Pipeline step 6: who may run what. Runs before every tool.
 *
 * - External connections are for paid plans only. Free accounts keep the
 *   normal free experience inside the app (in-app Sparklee is not external).
 * - The actor must hold the tool's scope.
 * - Each adapter's integration profile lists the tools it may use. The eXp
 *   Hub plans only: it shows the plan and links into SparkReels, which keeps
 *   the "no full scripts in the Hub" rule.
 *
 * Plan limits, Fair Housing, My Voice, publishing permissions and render
 * concurrency are NOT re-implemented here: the shared services the tools call
 * enforce them, exactly as they do for the app.
 */

const PROFILE: Record<Adapter, "all" | string[]> = {
  mcp: "all",
  in_app: "all",
  hub: ["get_account", "plan_spark"],
  // Signals can only propose (V1.1).
  halo: ["plan_spark"],
  boldtrail: ["plan_spark"],
  ghl: ["plan_spark"],
};

export const UPGRADE_MESSAGE =
  "Connecting an AI assistant to SparkReels is part of the paid plans. Pick a plan in Billing to connect, or keep using SparkReels free in the app.";

export function guard(actor: AgentActor, ctx: AgentContext, tool: string, scope: Scope): AgentResult | null {
  if (actor.adapter !== "in_app" && !ctx.paid) return denied(UPGRADE_MESSAGE, "paid_plan_required");
  const allowed = PROFILE[actor.adapter];
  if (allowed !== "all" && !allowed.includes(tool)) {
    return denied("That isn't available from this connection. Open SparkReels to do it.", "not_in_profile");
  }
  if (!actor.scopes.includes(scope)) {
    // Added after the first connections (2026-11-25). An approved app skips
    // the Allow page on a plain reconnect, so the way to add it is Disconnect.
    if (scope === "contacts:email") {
      return denied(
        "Emailing contacts needs one more permission. In SparkReels, open Settings → AI connections, press Disconnect on this app, then connect it again and press Allow.",
        "scope_missing",
      );
    }
    return denied(`This connection wasn't given permission for that. Reconnect and allow "${scope}".`, "scope_missing");
  }
  return null;
}
