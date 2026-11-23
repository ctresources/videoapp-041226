import { createAdminClient } from "@/lib/supabase/admin";
import { createSparkScript, type CreateSparkBody } from "@/lib/scripts/create-spark";
import { topicChat } from "@/lib/scripts/topic-chat";
import { writeBlog } from "@/lib/content/blog";
import { writeShareKit } from "@/lib/content/share-kit";
import { renderSparkVideo } from "@/lib/halo/make";
import { getRenderStatus } from "@/lib/video/status";
import { publishToTargets } from "@/lib/social/publish";
import { partnerAccountId, partnerPlatform, type PartnerPlatform } from "@/lib/utils/social-platforms";
import { formatWhen, isValidTimeZone, zonedToUtc } from "@/lib/utils/time-zone";
import type { ServiceResult } from "@/lib/content/service-result";
import type { HaloSetup } from "@/lib/halo";
import { type AgentContext, videosLeft } from "@/lib/agent/context";
import { buildPlan, needsPlace, placeFor, readIntent, savePlan, summarize } from "@/lib/agent/planner";
import { decidePlan, getPlan, maybeCompletePlan, planAuthorizes, PUBLISH_CONFIRM_MINUTES, type PlanStep } from "@/lib/agent/approvals";
import { claimAction, finishAction, requestIdFor } from "@/lib/agent/idempotency";
import { failed, needsInput, ok, type AgentActor, type AgentResult, type Scope } from "@/lib/agent/types";

/**
 * The V1 tools (plan revision 5). Each one is a thin layer over a shared
 * service the app's own routes call: reused, never copied. Plan limits,
 * Fair Housing, My Voice, publishing permissions and render concurrency are
 * enforced inside those services, the same as in the app.
 */

export interface ToolDef {
  name: string;
  scope: Scope;
  description: string;
  /** JSON Schema for the input, shown to MCP clients. */
  input: Record<string, unknown>;
  run: (actor: AgentActor, ctx: AgentContext, input: Record<string, unknown>) => Promise<AgentResult & { audit?: Record<string, unknown> }>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const label = (p: string) => (p === "youtube" ? "YouTube" : partnerPlatform(p)?.label ?? p);
const fromService = (r: ServiceResult, okMessage: string) => {
  const body = (r.body ?? {}) as Record<string, unknown>;
  return r.status < 400 ? ok(okMessage, body) : failed(String(body.error ?? "That didn't work. Try again."), String(body.code ?? `http_${r.status}`));
};

async function userEmail(userId: string): Promise<string | null> {
  const { data } = await createAdminClient().auth.admin.getUserById(userId);
  return data.user?.email ?? null;
}

/** A direct call outside a plan becomes a one-step plan that needs approval first. */
async function oneStepPlan(actor: AgentActor, ctx: AgentContext, step: Omit<PlanStep, "n">, goal: string): Promise<AgentResult> {
  const steps: PlanStep[] = [{ ...step, n: 1 }];
  const totals = { videosNeeded: step.usesVideo ? 1 : 0, videosLeft: videosLeft(ctx), platforms: [], notConnected: [], features: [step.tool] };
  const summary = summarize(steps, totals, [], []);
  const planId = await savePlan(actor, { goal, steps, totals, summary, upgrade: [] });
  return { status: "needs_approval", message: summary, planId, data: { planId, steps, totals } };
}

/** The Spark (project id) a plan step works on: given directly, or made by an earlier step. */
async function sparkFor(userId: string, planId: string | null, input: Record<string, unknown>): Promise<string | null> {
  if (str(input.sparkId)) return str(input.sparkId);
  const from = Number(input.sparkFromStep);
  if (!planId || !from) return null;
  const { data } = await createAdminClient()
    .from("agent_actions").select("result").eq("user_id", userId).eq("plan_id", planId).eq("step", from).eq("status", "succeeded").maybeSingle();
  const r = (data as { result: { sparkId?: string } | null } | null)?.result;
  return r?.sparkId ?? null;
}

/**
 * Runs one creation step of an approved plan, exactly once.
 * approve_plan authorizes these (and the credits they use), nothing else.
 */
async function runCreationStep(
  actor: AgentActor,
  ctx: AgentContext,
  tool: string,
  input: Record<string, unknown>,
  work: (step: PlanStep, planId: string) => Promise<AgentResult & { sparkId?: string }>,
  direct: { title: string; usesVideo: boolean },
): Promise<AgentResult> {
  const planId = str(input.planId);
  if (!planId) return oneStepPlan(actor, ctx, { tool, title: direct.title, input, usesVideo: direct.usesVideo, needsConfirm: false }, direct.title);
  const plan = await getPlan(actor.userId, planId);
  if (!plan) return failed("That plan isn't there. Ask for a new one.", "not_found");
  const stepN = Number(input.step ?? plan.steps.find((s) => s.tool === tool)?.n);
  const auth = planAuthorizes(plan, stepN, tool);
  if (!auth.ok) return { status: auth.code === "plan_not_approved" ? "needs_approval" : "denied", message: auth.message, code: auth.code, planId };

  const claim = await claimAction(actor, {
    tool, kind: "create", requestId: `plan:${planId}:${stepN}`, payload: auth.step.input, planId, step: stepN,
  });
  if (claim.kind === "conflict") return failed("That step was already started with different details.", "idempotency_conflict");
  if (claim.kind === "repeat") {
    return claim.status === "running"
      ? ok("That step is already running.", { actionId: claim.actionId }, { actionId: claim.actionId, planId })
      : ok(claim.status === "succeeded" ? "Already done." : "That step already ran and failed. Ask for a new plan to try again.", claim.result, { actionId: claim.actionId, planId });
  }
  try {
    const r = await work(auth.step, planId);
    await finishAction(claim.actionId, r.status === "ok" ? "succeeded" : "failed", { ...(r.data as object), sparkId: r.sparkId, message: r.message });
    if (r.status === "ok") await maybeCompletePlan(actor.userId, planId);
    return { ...r, actionId: claim.actionId, planId };
  } catch (e) {
    await finishAction(claim.actionId, "failed", { message: e instanceof Error ? e.message : "error" });
    return failed("Something went wrong on that step. Try again in a moment.");
  }
}

/** Builds publish targets for connected platforms, the same shape the Publish window sends. */
function targetsFor(platforms: string[]) {
  return platforms.map((p) =>
    p === "youtube"
      ? { accountId: "native_youtube", platform: "youtube", source: "native" as const }
      : { accountId: partnerAccountId(p as PartnerPlatform), platform: p, source: "partner" as const });
}

/** Step 1 of publishing: prepare an exact, expiring publish action. Posts nothing. */
async function preparePublish(actor: AgentActor, ctx: AgentContext, input: Record<string, unknown>, schedule: boolean): Promise<AgentResult> {
  const admin = createAdminClient();
  let videoId = str(input.videoId);
  if (!videoId && str(input.sparkId)) {
    const { data } = await admin.from("generated_videos").select("id").eq("user_id", actor.userId).eq("project_id", str(input.sparkId))
      .eq("render_status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    videoId = (data as { id: string } | null)?.id ?? "";
  }
  if (!videoId) return needsInput("Which video? Give a videoId or the sparkId of a finished video.", "video_required");
  const { data: v } = await admin.from("generated_videos").select("id, render_status, video_url, project_id").eq("id", videoId).eq("user_id", actor.userId).maybeSingle();
  const video = v as { id: string; render_status: string; video_url: string | null; project_id: string | null } | null;
  if (!video) return failed("That video isn't in your account.", "not_yours");
  if (video.render_status !== "completed") return failed("That video isn't finished yet. Check its status and try again when it's ready.", "video_not_ready");

  const asked = Array.isArray(input.platforms) ? (input.platforms as unknown[]).map(String) : [];
  const platforms = (asked.length ? asked : ctx.connected).filter((p) => ctx.connected.includes(p));
  const missing = asked.filter((p) => !ctx.connected.includes(p));
  if (!platforms.length) return needsInput("None of those accounts are connected. Connect them in SparkReels Settings first.", "no_connected_platforms", { notConnected: missing });

  let scheduledAt: string | undefined;
  let whenText = "now";
  let tz = ctx.timeZone;
  if (schedule) {
    const when = str(input.when);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return needsInput("When should it go out? Give a local date and time like 2026-11-27T09:00.", "when_required");
    if (!tz) {
      // Never assume a time zone. Saved only while the profile has none.
      const given = str(input.timeZone);
      if (!isValidTimeZone(given)) return needsInput("What time zone are you in? (For example America/New_York.)", "needs_time_zone");
      await admin.from("profiles").update({ time_zone: given }).eq("id", actor.userId).is("time_zone", null);
      tz = given;
    }
    const at = zonedToUtc(when.slice(0, 10), when.slice(11), tz);
    if (at.getTime() < Date.now() + 5 * 60_000) return needsInput("That time has passed or is too soon. Pick a time at least a few minutes from now.", "when_in_past");
    scheduledAt = at.toISOString();
    whenText = `${formatWhen(at, tz)} (${tz})`;
  }

  const payload = { videoId, targets: targetsFor(platforms), ...(scheduledAt && { scheduledAt }) };
  const expiresAt = new Date(Date.now() + PUBLISH_CONFIRM_MINUTES * 60_000).toISOString();
  const claim = await claimAction(actor, {
    tool: schedule ? "schedule_video" : "publish_video", kind: "publish",
    requestId: requestIdFor(actor, schedule ? "schedule_video" : "publish_video", payload, str(input.requestId) || null),
    payload, status: "prepared", expiresAt, planId: str(input.planId) || null, step: Number(input.step) || null,
  });
  if (claim.kind === "conflict") return failed("That request id was already used for something different.", "idempotency_conflict");
  const preview = {
    actionId: claim.actionId,
    video: { id: videoId, url: video.video_url },
    destinations: platforms.map(label),
    notConnected: missing.map(label),
    when: whenText,
    timeZone: schedule ? tz : null,
    expiresAt,
  };
  return {
    status: "needs_approval",
    message: `Ready to ${schedule ? "schedule" : "post"} this video to ${preview.destinations.join(", ")}${schedule ? ` for ${whenText}` : " now"}. Nothing is posted until you confirm. This expires in ${PUBLISH_CONFIRM_MINUTES} minutes.`,
    actionId: claim.actionId,
    data: preview,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_account",
    scope: "account:read",
    description: "The SparkReels account: plan, videos left this month, enabled features, connected platforms, market, time zone, and whether an avatar, Digital Twin and cloned voice are ready.",
    input: { type: "object", properties: {}, additionalProperties: false },
    async run(_a, ctx) {
      const al = ctx.allowance;
      return ok("Here's the account.", {
        plan: al.tier, level: al.level, videosLeft: videosLeft(ctx), videosPerMonth: al.shortPerMonth,
        features: { videoTemplates: al.videoTemplates, sparkPodcast: al.sparkPodcast, sparkCalendar: al.campaignCalendar },
        connectedPlatforms: ctx.connected.map(label), market: ctx.market, timeZone: ctx.timeZone, ready: ctx.ready,
      });
    },
  },
  {
    name: "plan_spark",
    scope: "sparks:plan",
    description: "START HERE. Turns a goal (\"Market my listing\", \"Keep me visible to sellers in Blue Bell this week\") into a recommended Spark plan. Creates nothing and uses no credits. To edit a plan, pass planId and change. Show the plan to the user with Approve / Edit / Cancel.",
    input: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What the agent wants, in their words." },
        planId: { type: "string", description: "Only to edit an existing plan." },
        change: { type: "string", description: "Only with planId: what to change." },
      },
    },
    async run(actor, ctx, input) {
      let goal = str(input.goal);
      let version = 1;
      if (str(input.planId)) {
        const old = await getPlan(actor.userId, str(input.planId));
        if (!old) return failed("That plan isn't there. Ask for a new one.", "not_found");
        const { data } = await createAdminClient().from("agent_plans").select("goal").eq("id", old.id).single();
        goal = `${(data as { goal: string | null } | null)?.goal ?? ""}\nChange: ${str(input.change)}`.trim();
        version = old.version + 1;
        await createAdminClient().from("agent_plans").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", old.id).eq("status", "proposed");
      }
      if (!goal) return needsInput("What would you like to make or get done?", "goal_required");
      const intent = await readIntent(goal, ctx);
      if (intent.clarify && intent.topic.length < 8) return needsInput(intent.clarify, "clarify");
      // Asked now, not after approval: the script writer refuses without a place.
      if (needsPlace(ctx) && !placeFor(intent, ctx)) {
        return needsInput("What town and state is this for? Ask the user, then call plan_spark again with it in the goal.", "town_required");
      }
      const { steps, totals, upgrade, notes } = buildPlan(intent, ctx);
      const summary = summarize(steps, totals, notes, upgrade);
      const planId = await savePlan(actor, { goal, steps, totals, summary, upgrade, version });
      return { status: "needs_approval", message: summary, planId, data: { planId, version, steps, totals, upgrade, notes } };
    },
  },
  {
    name: "approve_plan",
    scope: "sparks:plan",
    description: "Approve or cancel a proposed plan, only after the user says so. Approval lets its creation steps run (script, video, blog, social copy). It never posts or schedules anything: those need confirm_publish.",
    input: {
      type: "object",
      properties: { planId: { type: "string" }, decision: { type: "string", enum: ["approve", "cancel"] } },
      required: ["planId", "decision"],
    },
    async run(actor, _ctx, input) {
      const r = await decidePlan(actor, str(input.planId), input.decision === "cancel" ? "cancel" : "approve");
      if (!r.ok) return failed(r.message, r.code);
      return ok(r.plan.status === "approved"
        ? "Plan approved. Run its steps in order: write_script, make_video, make_blog, make_social_copy (each with planId and step). Posting will ask for its own confirmation."
        : "Plan cancelled.", { planId: r.plan.id, status: r.plan.status, steps: r.plan.steps }, { planId: r.plan.id });
    },
  },
  {
    name: "write_script",
    scope: "sparks:write",
    description: "Writes the script for an approved plan step (planId + step) and saves it as a Spark draft in My Voice. Without a planId it returns a one-step plan to approve first.",
    input: {
      type: "object",
      properties: {
        planId: { type: "string" }, step: { type: "number" },
        topic: { type: "string", description: "Only without a plan." },
        city: { type: "string", description: "Only without a plan: the town it's about." },
        state: { type: "string", description: "Only without a plan: 2-letter state." },
      },
    },
    async run(actor, ctx, input) {
      const place = placeFor({ city: str(input.city) || null, state: str(input.state).toUpperCase() || null }, ctx);
      if (!str(input.planId) && needsPlace(ctx) && !place) {
        return needsInput("What town and state is this for?", "town_required");
      }
      const direct = { videoType: "custom", customTopic: str(input.topic), city: place?.city ?? "", state: place?.state ?? "" };
      return runCreationStep(actor, ctx, "write_script", str(input.planId) ? input : { ...input, ...direct }, async (step) => {
        const r = await createSparkScript(actor.userId, step.input as unknown as CreateSparkBody, { fromAutopilot: false });
        const project = (r.body as { project?: { id: string; title: string; ai_script: Record<string, unknown> } }).project;
        if (r.status >= 400 || !project) return fromService(r, "");
        return { ...ok(`Script written: "${project.title}".`, { sparkId: project.id, title: project.title, hook: project.ai_script?.hook, script: project.ai_script?.script }), sparkId: project.id };
      }, { title: `Write the script: "${str(input.topic)}"`, usesVideo: false });
    },
  },
  {
    name: "revise_script",
    scope: "sparks:write",
    description: "Changes a Spark's script conversationally: action \"second\" (another version), \"again\" (two new versions), \"pick\" (which: 0 or 1), or \"refine\" with a message such as \"shorter\" or \"more casual\". Uses no videos.",
    input: {
      type: "object",
      properties: {
        sparkId: { type: "string" },
        action: { type: "string", enum: ["second", "again", "pick", "refine"] },
        which: { type: "number" },
        message: { type: "string" },
      },
      required: ["sparkId", "action"],
    },
    async run(actor, _ctx, input) {
      const r = await topicChat(actor.userId, { projectId: str(input.sparkId), action: str(input.action), which: Number(input.which), message: str(input.message) });
      return { ...fromService(r, "Script updated."), audit: { sparkId: str(input.sparkId) } };
    },
  },
  {
    name: "make_video",
    scope: "videos:create",
    description: "Starts the video for an approved plan step (planId + step). Uses one of the plan's videos, through SparkReels' normal render queue. Check progress with video_status.",
    input: { type: "object", properties: { planId: { type: "string" }, step: { type: "number" }, sparkId: { type: "string" } } },
    async run(actor, ctx, input) {
      return runCreationStep(actor, ctx, "make_video", input, async (step, planId) => {
        const sparkId = await sparkFor(actor.userId, planId, step.input);
        if (!sparkId) return failed("Write the script first: the video needs a Spark draft.", "spark_required");
        const setup = { size: step.input.size === "wide" ? "horizontal" : "vertical", voiceOnly: step.input.voiceOnly === true, captions: true } as unknown as HaloSetup;
        const r = await renderSparkVideo(createAdminClient(), { id: actor.userId, email: await userEmail(actor.userId) }, sparkId, setup);
        if (r.status >= 400) return failed(String(r.out.error ?? "Couldn't start the video."), String(r.out.code ?? `http_${r.status}`));
        return { ...ok(r.out.queued ? "The video is in line to render. Check video_status in a few minutes." : "The video is rendering. Check video_status in a few minutes.", { sparkId, queued: r.out.queued === true }), sparkId };
      }, { title: "Make the video", usesVideo: true });
    },
  },
  {
    name: "video_status",
    scope: "videos:read",
    description: "Whether a video is rendering, ready (with its link) or failed (with a plain reason). Give the sparkId or videoId.",
    input: { type: "object", properties: { sparkId: { type: "string" }, videoId: { type: "string" } } },
    async run(actor, _ctx, input) {
      const admin = createAdminClient();
      let q = admin.from("generated_videos").select("id, render_job_id, project_id").eq("user_id", actor.userId);
      q = str(input.videoId) ? q.eq("id", str(input.videoId)) : q.eq("project_id", str(input.sparkId));
      const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      const v = data as { id: string; render_job_id: string | null; project_id: string | null } | null;
      if (!v?.render_job_id) return failed("No video found for that Spark yet.", "not_found");
      const r = await getRenderStatus(actor.userId, v.render_job_id);
      const b = (r.body ?? {}) as { status?: string; url?: string; error?: string };
      return { ...ok(b.status === "completed" ? "The video is ready." : b.status === "failed" ? `The video failed: ${b.error ?? "unknown reason"}.` : "Still rendering.", { videoId: v.id, sparkId: v.project_id, ...b }), audit: { videoId: v.id, sparkId: v.project_id } };
    },
  },
  {
    name: "list_videos",
    scope: "videos:read",
    description: "Recent videos and drafts, newest first.",
    input: { type: "object", properties: { limit: { type: "number" } } },
    async run(actor, _ctx, input) {
      const n = Math.min(25, Math.max(1, Number(input.limit) || 10));
      const admin = createAdminClient();
      const [{ data: vids }, { data: drafts }] = await Promise.all([
        // The title lives on the video's Spark (2026-11-22).
        admin.from("generated_videos").select("id, project_id, render_status, video_url, created_at, projects(title)").eq("user_id", actor.userId).order("created_at", { ascending: false }).limit(n),
        admin.from("projects").select("id, title, status, created_at").eq("user_id", actor.userId).eq("status", "draft").order("created_at", { ascending: false }).limit(n),
      ]);
      const videos = ((vids ?? []) as unknown as (Record<string, unknown> & { projects?: { title?: string | null } | { title?: string | null }[] | null })[]).map(({ projects, ...v }) => {
        const p = Array.isArray(projects) ? projects[0] : projects;
        return { ...v, title: p?.title ?? null };
      });
      return ok("Your recent videos and drafts.", { videos, drafts: drafts ?? [] });
    },
  },
  {
    name: "make_blog",
    scope: "sparks:write",
    description: "Writes the blog post for a Spark from its script, as the app's blog writer does. Run it as an approved plan step (planId + step).",
    input: { type: "object", properties: { planId: { type: "string" }, step: { type: "number" }, sparkId: { type: "string" } } },
    async run(actor, ctx, input) {
      return runCreationStep(actor, ctx, "make_blog", input, async (step, planId) => {
        const sparkId = await sparkFor(actor.userId, planId, step.input);
        if (!sparkId) return failed("Write the script first.", "spark_required");
        const r = await writeBlog(actor.userId, { projectId: sparkId });
        return { ...fromService(r, "Blog post written."), sparkId };
      }, { title: "Write the blog post", usesVideo: false });
    },
  },
  {
    name: "make_social_copy",
    scope: "sparks:write",
    description: "Writes the Share Kit copy for a Spark's video: LinkedIn and Facebook posts, Instagram caption, YouTube title and description. Run it as an approved plan step.",
    input: { type: "object", properties: { planId: { type: "string" }, step: { type: "number" }, sparkId: { type: "string" } } },
    async run(actor, ctx, input) {
      return runCreationStep(actor, ctx, "make_social_copy", input, async (step, planId) => {
        const sparkId = await sparkFor(actor.userId, planId, step.input);
        if (!sparkId) return failed("Write the script first.", "spark_required");
        const r = await writeShareKit(actor.userId, { projectId: sparkId });
        return { ...fromService(r, "Social copy written."), sparkId };
      }, { title: "Write the social copy", usesVideo: false });
    },
  },
  {
    name: "publish_video",
    scope: "publish:write",
    description: "Step 1 of posting now: prepares the exact post (finished video, destinations) and returns an actionId. Posts nothing. Show the preview to the user; only after they confirm, call confirm_publish.",
    input: {
      type: "object",
      properties: { videoId: { type: "string" }, sparkId: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, requestId: { type: "string" } },
    },
    async run(actor, ctx, input) { return preparePublish(actor, ctx, input, false); },
  },
  {
    name: "schedule_video",
    scope: "publish:write",
    description: "Step 1 of scheduling: prepares the exact post with a local date and time (\"when\": \"YYYY-MM-DDTHH:mm\") in the user's SparkReels time zone and returns an actionId. Posts nothing. If the time zone is missing it asks for one.",
    input: {
      type: "object",
      properties: {
        videoId: { type: "string" }, sparkId: { type: "string" }, platforms: { type: "array", items: { type: "string" } },
        when: { type: "string" }, timeZone: { type: "string" }, requestId: { type: "string" },
      },
      required: ["when"],
    },
    async run(actor, ctx, input) { return preparePublish(actor, ctx, input, true); },
  },
  {
    name: "confirm_publish",
    scope: "publish:write",
    description: "Step 2: actually posts or schedules a prepared action (actionId), only after the user confirmed the exact video, destinations, date, time and time zone. Works once; expires 30 minutes after it was prepared.",
    input: { type: "object", properties: { actionId: { type: "string" } }, required: ["actionId"] },
    async run(actor, ctx, input) {
      const admin = createAdminClient();
      const { data } = await admin.from("agent_actions").select("id, kind, status, payload, expires_at").eq("id", str(input.actionId)).eq("user_id", actor.userId).maybeSingle();
      const a = data as { id: string; kind: string; status: string; payload: { videoId: string; targets: { platform: string }[]; scheduledAt?: string }; expires_at: string | null } | null;
      // A publish confirmation can only ever carry out a publish action.
      if (!a || a.kind !== "publish") return failed("That isn't a post waiting for confirmation.", "not_found");
      if (a.status === "succeeded") return ok("Already posted.", undefined, { actionId: a.id });
      if (a.status !== "prepared") return failed(`That post is ${a.status}.`, `action_${a.status}`);
      if (a.expires_at && Date.parse(a.expires_at) < Date.now()) {
        await admin.from("agent_actions").update({ status: "expired" }).eq("id", a.id).eq("status", "prepared");
        return failed("That confirmation expired. Prepare the post again.", "action_expired");
      }
      if (a.payload.targets.some((t) => !ctx.connected.includes(t.platform))) {
        return failed("One of those accounts is no longer connected. Prepare the post again.", "platform_disconnected");
      }
      // prepared → running, once: a second confirm can't post twice.
      const { data: claimed } = await admin.from("agent_actions")
        .update({ status: "running", confirmed_via: "confirm_tool", updated_at: new Date().toISOString() })
        .eq("id", a.id).eq("status", "prepared").select("id").maybeSingle();
      if (!claimed) return failed("That post is already being sent.", "action_running");
      const r = await publishToTargets(actor.userId, a.payload as never);
      const body = (r.body ?? {}) as Record<string, unknown>;
      await finishAction(a.id, r.status < 400 ? "succeeded" : "failed", body);
      return {
        ...(r.status < 400 ? ok(a.payload.scheduledAt ? "Scheduled." : "Posted.", body, { actionId: a.id }) : failed(String(body.error ?? "Nothing could be posted."), "publish_failed")),
        audit: { videoId: a.payload.videoId, publishRef: Array.isArray(body.pendingRefs) ? String((body.pendingRefs as string[])[0] ?? "") : null, approvalState: "confirmed" },
      };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
