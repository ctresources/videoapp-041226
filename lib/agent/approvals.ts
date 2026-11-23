import { createAdminClient } from "@/lib/supabase/admin";
import { hashPayload } from "@/lib/agent/idempotency";
import type { AgentActor } from "@/lib/agent/types";

/**
 * The approval state machine (the owner's approval condition B, 2026-11-22).
 *
 *   PLAN     proposed ─approve_plan─▶ approved ─▶ completed
 *               │ └─edit─▶ proposed (new version, new hash)
 *               └─cancel─▶ cancelled          approved ─24 h─▶ expired
 *
 *   PUBLISH  prepared ─confirm_publish─▶ running ─▶ succeeded | failed
 *               └─30 min─▶ expired
 *
 *   CRM      prepared ─confirm_crm_send─▶ running ─▶ succeeded | failed   (V1.1)
 *
 * approve_plan authorizes CREATION only (video, blog, social copy and the
 * credits they use). It never authorizes publishing, scheduling or CRM
 * sending: those always need their own confirmation, and a confirmation of
 * one kind can never carry out another (agent_actions.kind).
 */

export const PLAN_APPROVAL_HOURS = 24;
export const PUBLISH_CONFIRM_MINUTES = 30;

/** Step kinds approve_plan may authorize. Anything else needs its own confirmation. */
export const CREATION_TOOLS = new Set(["write_script", "revise_script", "make_video", "make_blog", "make_social_copy"]);

export interface PlanStep {
  n: number;
  tool: string;
  title: string;
  input: Record<string, unknown>;
  usesVideo: boolean;
  /** Publishing/scheduling/CRM steps: approval only prepares them. */
  needsConfirm: boolean;
  /** Recommended, but its tool isn't available yet (e.g. CRM in V1.1). */
  comingSoon?: boolean;
  /** Done by the person in SparkReels, not by a tool (recording on the teleprompter). */
  manual?: boolean;
}

export const planHash = (steps: PlanStep[], totals: unknown) => hashPayload({ steps, totals });

export interface PlanRow {
  id: string;
  user_id: string;
  status: string;
  steps: PlanStep[];
  totals: Record<string, unknown>;
  plan_hash: string;
  version: number;
  approval_expires_at: string | null;
  summary: string | null;
}

export async function getPlan(userId: string, planId: string): Promise<PlanRow | null> {
  const { data } = await createAdminClient()
    .from("agent_plans")
    .select("id, user_id, status, steps, totals, plan_hash, version, approval_expires_at, summary")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

/** Approve or cancel a proposed plan. Approval is tied to the plan's hash. */
export async function decidePlan(
  actor: AgentActor,
  planId: string,
  decision: "approve" | "cancel",
): Promise<{ ok: true; plan: PlanRow } | { ok: false; code: string; message: string }> {
  const plan = await getPlan(actor.userId, planId);
  if (!plan) return { ok: false, code: "not_found", message: "That plan isn't there. Ask for a new one." };
  if (plan.status !== "proposed") {
    return { ok: false, code: `plan_${plan.status}`, message: `That plan is already ${plan.status}.` };
  }
  if (plan.plan_hash !== planHash(plan.steps, plan.totals)) {
    return { ok: false, code: "plan_changed", message: "That plan changed. Ask for it again before approving." };
  }
  const admin = createAdminClient();
  const now = new Date();
  const patch = decision === "approve"
    ? { status: "approved", approved_at: now.toISOString(), approval_expires_at: new Date(now.getTime() + PLAN_APPROVAL_HOURS * 3_600_000).toISOString(), updated_at: now.toISOString() }
    : { status: "cancelled", updated_at: now.toISOString() };
  // Conditional on still being "proposed": two approvals can't race.
  const { data } = await admin.from("agent_plans").update(patch).eq("id", planId).eq("status", "proposed").select("id").maybeSingle();
  if (!data) return { ok: false, code: "plan_changed", message: "That plan changed while you were deciding. Ask for it again." };
  return { ok: true, plan: { ...plan, status: patch.status } as PlanRow };
}

/**
 * Whether an approved plan authorizes this creation step. Publishing and
 * scheduling steps are never authorized here, whatever the plan says.
 */
export function planAuthorizes(plan: PlanRow, step: number, tool: string): { ok: true; step: PlanStep } | { ok: false; code: string; message: string } {
  if (plan.status !== "approved") return { ok: false, code: "plan_not_approved", message: "Approve the plan first." };
  if (plan.approval_expires_at && Date.parse(plan.approval_expires_at) < Date.now()) {
    return { ok: false, code: "plan_expired", message: "That approval expired. Ask for the plan again." };
  }
  const s = plan.steps.find((x) => x.n === step);
  if (!s || s.tool !== tool) return { ok: false, code: "step_mismatch", message: "That step isn't in the approved plan." };
  if (!CREATION_TOOLS.has(tool) || s.needsConfirm) {
    return { ok: false, code: "needs_own_confirmation", message: "Publishing and scheduling need their own confirmation." };
  }
  return { ok: true, step: s };
}

/** Marks a plan completed once every creation step has finished. */
export async function maybeCompletePlan(userId: string, planId: string): Promise<void> {
  const admin = createAdminClient();
  const plan = await getPlan(userId, planId);
  if (!plan || plan.status !== "approved") return;
  const creationSteps = plan.steps.filter((s) => CREATION_TOOLS.has(s.tool) && !s.comingSoon);
  const { data } = await admin.from("agent_actions").select("step, status").eq("plan_id", planId).eq("kind", "create");
  const done = new Set(((data ?? []) as { step: number; status: string }[]).filter((r) => r.status === "succeeded").map((r) => r.step));
  if (creationSteps.every((s) => done.has(s.n))) {
    await admin.from("agent_plans").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", planId).eq("status", "approved");
  }
}
