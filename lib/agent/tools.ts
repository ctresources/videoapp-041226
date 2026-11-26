import { createAdminClient } from "@/lib/supabase/admin";
import { createSparkScript, type CreateSparkBody } from "@/lib/scripts/create-spark";
import { topicChat } from "@/lib/scripts/topic-chat";
import { writeBlog } from "@/lib/content/blog";
import { writeShareKit } from "@/lib/content/share-kit";
import { renderSparkCinematic, renderSparkVideo } from "@/lib/halo/make";
import { getRenderStatus } from "@/lib/video/status";
import { publishToTargets } from "@/lib/social/publish";
import { partnerAccountId, partnerPlatform, type PartnerPlatform } from "@/lib/utils/social-platforms";
import { formatWhen, isValidTimeZone, zonedToUtc } from "@/lib/utils/time-zone";
import type { ServiceResult } from "@/lib/content/service-result";
import type { HaloSetup } from "@/lib/halo";
import { type AgentContext, videosLeft } from "@/lib/agent/context";
import {
  asPresenter, asShape, asStyle, buildPlan, CAMERA_READY_NOTE, closingLabel, contactsPhrase, crmWanted, finishLabel, labeledAnswers, MUSIC_CHOICES, musicLabel, needsPlace, placeFor, presenterOptions, questionsFor,
  readIntent, recordLink, savePlan, styleLabel, styleOptions, summarize, videoLabel, videoOptionsFrom, type ClosingChoice, type Presenter, type Shape, type VideoOptions, type VideoStyle,
} from "@/lib/agent/planner";
import { scriptForReview, spokenScriptFor, type SpokenScript } from "@/lib/scripts/spoken-script";
import { draftScriptPatch } from "@/lib/scripts/draft-script";
import { findContacts, loadBoldTrailToken } from "@/lib/api/boldtrail";
import { cleanFilter, contactTag, type FoundContact } from "@/lib/boldtrail/filters";
import { sendVideoEmail, VIDEO_EMAIL_MAX } from "@/lib/email/video-email-send";
import { writeVideoEmail } from "@/lib/api/video-email";
import { loadAgentSignature } from "@/lib/utils/agent-signature";
import { staffLimits, STAFF_NO_EMAIL } from "@/lib/staff/staff";
import { describeAccount, linkedAccounts, type LinkedAccount } from "@/lib/accounts/links";
import { getAvatarLooks } from "@/lib/api/heygen";
import { pictureForPlan, type PlanPicture } from "@/lib/agent/plan-picture";
import { imageLinks, imagesForPlan, labeledVisuals, MAX_PLAN_IMAGES, visualsFrom, withoutVisualLabels, type PlanVisuals } from "@/lib/agent/plan-visuals";
import { cleanVisualDirection } from "@/lib/utils/visual-direction";
import { livePosts, liveSummary, postCopyFor, previewFor, type PostCopy, type PostProject } from "@/lib/agent/publish-check";
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

/**
 * Which SparkReels account this connection is using, by name and email
 * (2026-11-25, the owner's ask: Cursor made a video on her second account
 * when she meant her main one). Said at the top of every plan and question,
 * so a wrong account is caught before anything is made.
 */
async function accountOf(actor: AgentActor, ctx: AgentContext): Promise<{ name: string | null; email: string | null; line: string }> {
  const email = await userEmail(actor.userId).catch(() => null);
  const who = [ctx.name, email && `(${email})`].filter(Boolean).join(" ") || "this account";
  return {
    name: ctx.name, email,
    line: `SparkReels account: ${who}. If that's not the account the user wants, stop before making anything; if they name one of their linked accounts, call switch_account.`,
  };
}

/**
 * What the account's videos carry (2026-11-25, ChatGPT couldn't check it):
 * company, website, phone, logo, brand colors, brand kit and the closing
 * line, word for word, as saved in Settings. Read only.
 */
async function brandingOf(userId: string) {
  const { data } = await createAdminClient().from("profiles")
    .select("company_name, website, phone, logo_url, brand_colors, heygen_brand_kit_id, default_cta")
    .eq("id", userId).maybeSingle();
  const p = (data ?? {}) as { company_name?: string | null; website?: string | null; phone?: string | null; logo_url?: string | null; brand_colors?: string[] | null; heygen_brand_kit_id?: string | null; default_cta?: string | null };
  return {
    company: p.company_name || null,
    website: p.website || null,
    phone: p.phone || null,
    logo: !!p.logo_url,
    brandColors: p.brand_colors ?? [],
    brandKitConnected: !!p.heygen_brand_kit_id,
    closingLine: p.default_cta?.trim() || null,
  };
}

/** The connecting account and every account linked to it: the ones switch_account can use. */
async function switchableAccounts(actor: AgentActor): Promise<LinkedAccount[]> {
  const admin = createAdminClient();
  const owner = actor.ownerUserId ?? actor.userId;
  const [me, linked] = await Promise.all([describeAccount(admin, owner), linkedAccounts(admin, owner)]);
  return [me, ...linked];
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

// ── Seeing and approving the script (2026-11-25, the owner's ask: "I want to
// see the video script going forward") ──
// Every word the video will say is shown, and approved, before a video is
// made. The approval is tied to those exact words (spoken-script's version):
// any change to the opening, script or closing line needs a new approval.

const REVIEW_ASK = "Show the user every word below, labeled Opening (hook), Script and Closing line, with the word count and about how long it runs. Don't summarize, shorten or reword it. Ask them to approve it, change it (revise_script), or give their own words (set_script saves them word for word). Make no video until they approve; then call approve_script with this sparkId and version.";

const approvalKey = (sparkId: string, version: string) => `script:${sparkId}:${version}`;

async function scriptApproved(userId: string, sparkId: string, version: string): Promise<boolean> {
  const { data } = await createAdminClient().from("agent_actions").select("id")
    .eq("user_id", userId).eq("tool", "approve_script").eq("request_id", approvalKey(sparkId, version)).eq("status", "succeeded").maybeSingle();
  return !!data;
}

/** A closing-line choice saved onto a Spark, through the editor's own draft save. */
async function saveClosing(userId: string, sparkId: string, choice: ClosingChoice, text?: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("projects").select("ai_script").eq("id", sparkId).eq("user_id", userId).maybeSingle();
  if (!data) return false;
  const ai = ((data as { ai_script: Record<string, unknown> | null }).ai_script) ?? {};
  const patch = choice === "none" ? { ctaOff: true }
    : choice === "custom" ? { ctaOff: false, cta: (text ?? "").trim(), ctaEdited: true }
    : { ctaOff: false, ctaEdited: false };
  const { error } = await admin.from("projects").update({ ai_script: draftScriptPatch(ai, patch) }).eq("id", sparkId).eq("user_id", userId);
  return !error;
}

/** The Spark a make_video call would render: given, or made by the plan's script step. */
async function videoSparkFor(userId: string, input: Record<string, unknown>): Promise<string | null> {
  if (!str(input.planId)) return str(input.sparkId) || null;
  const plan = await getPlan(userId, str(input.planId));
  const step = plan?.steps.find((s) => (input.step ? s.n === Number(input.step) : s.tool === "make_video"));
  return step ? sparkFor(userId, plan!.id, step.input) : null;
}

/**
 * Everything the video will be made with, said before it starts (2026-11-25):
 * the account, the script version and each setting, from the approved plan.
 */
async function videoSettings(actor: AgentActor, ctx: AgentContext, stepInput: Record<string, unknown>, sp: SpokenScript) {
  const [account, branding] = await Promise.all([accountOf(actor, ctx), brandingOf(actor.userId)]);
  const shape: Shape = stepInput.size === "vertical" ? "vertical" : "wide";
  const presenter = asPresenter(stepInput.presenter) ?? (stepInput.voiceOnly === true ? "voice_only" : null);
  const style = asStyle(stepInput.style);
  const music = str(stepInput.music) || "inspiring";
  const card = style !== "cinematic" && stepInput.contactCard !== false;
  const images = Array.isArray(stepInput.images) ? stepInput.images.length : 0;
  const circle = style === "circle" && presenter !== "voice_only";
  return {
    account: [account.name, account.email && `(${account.email})`].filter(Boolean).join(" "),
    script: `version ${sp.version}: ${sp.words} words, about ${sp.seconds} seconds`,
    video: presenter ? videoLabel(shape, presenter, style) : shape === "vertical" ? "Vertical" : "Wide",
    size: shape === "vertical" ? "Vertical 9:16" : "Wide 16:9",
    bRoll: style === "cinematic" ? "a new AI-made place for each line"
      : circle ? "stock footage picked for each sentence"
      : `made to match the script${str(stepInput.visualDirection) ? ", following your on-screen description" : ""}`,
    ...(images && { yourImages: images }),
    music: music === "none" ? "none" : musicLabel(music),
    captions: stepInput.captions === false ? "off" : "on",
    logo: card && branding.logo ? "on the contact card" : !circle && style !== "cinematic" && branding.brandKitConnected ? "your brand kit" : "not shown",
    closingLine: sp.closingLine || "none",
    contactCard: style === "cinematic" ? "not used in Cinematic AI Avatar" : card ? "on" : "off",
  };
}

const settingsLine = (s: Record<string, unknown>) => Object.entries(s).map(([k, v]) => `${k}: ${v}`).join("; ");

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

/**
 * The look for the presenter they picked. Left to fall through, a headshot
 * request could render the twin and a twin request the headshot, so each is
 * named here. Plan rules are still enforced by the render itself.
 */
async function lookFor(ctx: AgentContext, presenter: Presenter | null, shape: Shape): Promise<string | null> {
  if (presenter === "twin") return ctx.looks.twin;
  if (presenter !== "headshot") return null;
  const shaped = shape === "vertical" ? ctx.looks.tall ?? ctx.looks.wide : ctx.looks.wide ?? ctx.looks.tall;
  if (shaped) return shaped;
  if (!ctx.looks.photoGroup) return null;
  const looks = await getAvatarLooks(ctx.looks.photoGroup).catch(() => []);
  return (looks.find((l) => l.status === "completed") ?? looks[0])?.id ?? null;
}

/**
 * From real finished renders (2026-11-23, last 45 days): the Video Agent's
 * middle was 21 minutes and 9 in 10 finished within 30; Direct Video 7 and 13.
 */
export const renderingMessage = (provider: string | null) =>
  `Still rendering. This kind of video usually takes ${provider === "heygen_agent" ? "15 to 30" : "5 to 15"} minutes. There is no percent complete, so don't give one.`;

/** Builds publish targets for connected platforms, the same shape the Publish window sends. */
function targetsFor(platforms: string[], copy: PostCopy) {
  return platforms.map((p) =>
    p === "youtube"
      ? { accountId: "native_youtube", platform: "youtube", source: "native" as const, title: copy.title, description: copy.description }
      : { accountId: partnerAccountId(p as PartnerPlatform), platform: p, source: "partner" as const, title: copy.title, caption: copy.caption });
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
  const { data: v } = await admin.from("generated_videos").select("id, render_status, video_url, project_id, projects(title, ai_script, seo_data)").eq("id", videoId).eq("user_id", actor.userId).maybeSingle();
  const video = v as unknown as { id: string; render_status: string; video_url: string | null; project_id: string | null; projects: PostProject | PostProject[] | null } | null;
  if (!video) return failed("That video isn't in your account.", "not_yours");
  if (video.render_status !== "completed") return failed("That video isn't finished yet. Check its status and try again when it's ready.", "video_not_ready");

  const asked = Array.isArray(input.platforms) ? (input.platforms as unknown[]).map(String) : [];
  const platforms = (asked.length ? asked : ctx.connected).filter((p) => ctx.connected.includes(p));
  const missing = asked.filter((p) => !ctx.connected.includes(p));
  if (!platforms.length) return needsInput("None of those accounts are connected. Connect them in SparkReels Settings first.", "no_connected_platforms", { notConnected: missing });

  // Already out there: left out, unless they clearly asked for a second copy.
  const postAgain = input.postAgain === true;
  const live = await livePosts(admin, actor.userId, videoId, platforms);
  if (!live) return failed("Couldn't check where this video is already posted, so nothing was prepared. Try again in a moment.", "post_check_failed");
  const toPost = postAgain ? platforms : platforms.filter((p) => !live.some((l) => l.platform === p));
  const alreadyPosted = live.map((l) => ({ platform: label(l.platform), status: l.status, at: l.at }));
  if (!toPost.length) {
    return needsInput(
      `This video is ${liveSummary(live, label)}. Nothing was prepared, so it won't post twice. Tell the user. Only if they then clearly ask for a second copy, call again with postAgain: true.`,
      "already_posted",
      { alreadyPosted },
    );
  }

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

  const project = Array.isArray(video.projects) ? video.projects[0] ?? null : video.projects;
  const copy = postCopyFor(project);
  const payload = { videoId, targets: targetsFor(toPost, copy), ...(scheduledAt && { scheduledAt }), ...(postAgain && { postAgain: true }) };
  const expiresAt = new Date(Date.now() + PUBLISH_CONFIRM_MINUTES * 60_000).toISOString();
  const claim = await claimAction(actor, {
    tool: schedule ? "schedule_video" : "publish_video", kind: "publish",
    requestId: requestIdFor(actor, schedule ? "schedule_video" : "publish_video", payload, str(input.requestId) || null),
    payload, status: "prepared", expiresAt, planId: str(input.planId) || null, step: Number(input.step) || null,
  });
  if (claim.kind === "conflict") return failed("That request id was already used for something different.", "idempotency_conflict");
  if (claim.kind === "repeat" && claim.status !== "prepared") {
    return failed(`That same post was just tried and is ${claim.status}. Check My Sparks before trying again.`, `action_${claim.status}`);
  }
  const secondCopy = postAgain ? live.filter((l) => toPost.includes(l.platform)) : [];
  const leftOut = postAgain ? [] : live;
  const preview = {
    actionId: claim.actionId,
    video: { id: videoId, url: video.video_url },
    destinations: toPost.map(label),
    // Exactly what will post. Show these words; don't substitute others.
    title: copy.title,
    posts: toPost.map((p) => ({ ...previewFor(p, copy), platform: label(p) })),
    alreadyPosted,
    secondCopy: secondCopy.map((l) => label(l.platform)),
    notConnected: missing.map(label),
    when: whenText,
    timeZone: schedule ? tz : null,
    expiresAt,
  };
  return {
    status: "needs_approval",
    message: [
      `Ready to ${schedule ? "schedule" : "post"} this video to ${preview.destinations.join(", ")}${schedule ? ` for ${whenText}` : " now"}, titled "${copy.title}".`,
      leftOut.length ? `It's ${liveSummary(leftOut, label)}, so ${leftOut.length === 1 ? "that account is" : "those accounts are"} left out.` : "",
      secondCopy.length ? `This will be a SECOND copy: it's ${liveSummary(secondCopy, label)}.` : "",
      `Nothing is posted until you confirm. This expires in ${PUBLISH_CONFIRM_MINUTES} minutes.`,
    ].filter(Boolean).join(" "),
    actionId: claim.actionId,
    data: preview,
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_account",
    scope: "account:read",
    description: "The SparkReels account this connection uses (name and email), its plan, videos left this month, enabled features, connected platforms, market, time zone, and whether an avatar, Digital Twin and cloned voice are ready. Tell the user the account name and email.",
    input: { type: "object", properties: {}, additionalProperties: false },
    async run(actor, ctx) {
      const al = ctx.allowance;
      const [account, all] = await Promise.all([accountOf(actor, ctx), switchableAccounts(actor).catch(() => [] as LinkedAccount[])]);
      const others = all.filter((a) => a.id !== actor.userId).map((a) => ({ name: a.name, email: a.email }));
      return ok(others.length
        ? `${account.line} Other linked accounts: ${others.map((o) => [o.name, o.email && `(${o.email})`].filter(Boolean).join(" ")).join(", ")}.`
        : account.line, {
        account: { name: account.name, email: account.email },
        otherAccounts: others,
        branding: await brandingOf(actor.userId),
        plan: al.tier, level: al.level, videosLeft: videosLeft(ctx), videosPerMonth: al.shortPerMonth,
        features: { videoTemplates: al.videoTemplates, sparkPodcast: al.sparkPodcast, sparkCalendar: al.campaignCalendar },
        connectedPlatforms: ctx.connected.map(label), market: ctx.market, timeZone: ctx.timeZone, ready: ctx.ready,
      });
    },
  },
  {
    // Linked accounts (2026-11-25, the owner's approved mockup): only accounts
    // linked in Settings by signing in to each, so an AI app can never reach
    // an account its user hasn't proven is theirs.
    name: "switch_account",
    scope: "account:read",
    description: "Switches this connection to another of the user's SparkReels accounts, by its email. Only accounts the user linked in SparkReels Settings (AI connections → Your accounts). get_account lists them. After switching, everything (plans, videos, plan usage, Digital Twin, voice, branding) is that account's. Only when the user asks.",
    input: { type: "object", properties: { email: { type: "string", description: "The email of the account to use." } }, required: ["email"] },
    async run(actor, _ctx, input) {
      if (!actor.connectionId) return failed("Switching accounts works from a connected AI app.", "no_connection");
      const want = str(input.email).toLowerCase();
      if (!want) return needsInput("Which account? Give its email.", "email_required");
      const all = await switchableAccounts(actor);
      const target = all.find((a) => (a.email ?? "").toLowerCase() === want);
      if (!target) {
        return needsInput(
          "That account isn't linked. In SparkReels, open Settings → AI connections → Your accounts and press Link another account.",
          "not_linked",
          { accounts: all.map((a) => ({ name: a.name, email: a.email })) },
        );
      }
      const owner = actor.ownerUserId ?? actor.userId;
      await createAdminClient().from("agent_connections")
        .update({ active_user_id: target.id === owner ? null : target.id }).eq("id", actor.connectionId);
      const who = [target.name, target.email && `(${target.email})`].filter(Boolean).join(" ");
      return ok(`Switched to ${who}.`, { account: { name: target.name, email: target.email } });
    },
  },
  {
    name: "plan_spark",
    scope: "sparks:plan",
    description: "START HERE. Turns a goal (\"Market my listing\", \"Keep me visible to sellers in Blue Bell this week\") into a recommended Spark plan. Creates no script, video or post and uses no credits. Pass the user's goal word for word: do not rewrite it or add format, length, tone or who is on screen. Shape, presenter and style count only as these fields, and only when the user actually said them; never choose for them. If it returns questions, ask the user exactly those and wait, then call again with the same goal plus their answers. To edit a plan, pass planId and change. Show the plan with Approve / Edit / Cancel. If the result has a picture, show that one; never add images or photos from the web. If the user says what should appear in the video, pass it as showOnScreen, and pass only image links they gave you as images. Without those fields, end the goal with: On screen: <what to show>. Images: <links>. An image attached in this chat has no link: ask for a public https link. Never promise real website or app screens unless the plan uses an image of them.",
    input: {
      type: "object",
      properties: {
        goal: { type: "string", description: "What the agent wants, in their words." },
        shape: { type: "string", enum: ["vertical", "wide"], description: "Only if the user chose it." },
        presenter: { type: "string", enum: ["twin", "headshot", "voice_only", "camera"], description: "Who's on screen, only if the user chose it. camera = they record themselves in SparkReels." },
        style: { type: "string", enum: ["full", "circle", "cinematic"], description: "For an avatar, only if the user chose it. cinematic = Cinematic AI Avatar (Digital Twin only): a new place for each line." },
        showOnScreen: { type: "string", maxLength: 280, description: "What the user wants to see in the video, in their words. Visuals only; it never changes the script." },
        images: { type: "array", maxItems: MAX_PLAN_IMAGES, items: { type: "string" }, description: "Public https links to the user's own screenshots or photos, only links they gave you." },
        city: { type: "string", description: "The town, if the user gave it." },
        state: { type: "string", description: "2-letter state, if the user gave it." },
        music: { type: "string", enum: MUSIC_CHOICES, description: "Background music for the video. Inspiring when not given; none for no music." },
        captions: { type: "boolean", description: "Captions on the video. On when not given." },
        closingLine: { type: "string", enum: ["settings", "none", "custom"], description: "The spoken closing line: the one saved in Settings (default), none, or custom with closingText." },
        closingText: { type: "string", maxLength: 300, description: "Only with closingLine custom: the exact words." },
        contactCard: { type: "boolean", description: "The contact card (name, phone, website, logo) over the last seconds. On by default, off when closingLine is none, unless given." },
        planId: { type: "string", description: "Only to edit an existing plan." },
        change: { type: "string", description: "Only with planId: what to change." },
      },
    },
    async run(actor, ctx, input) {
      let goal = str(input.goal);
      let version = 1;
      let prev: { shape?: unknown; presenter?: unknown; style?: unknown } = {};
      let prevPicture: PlanPicture | null = null;
      let prevVisuals: PlanVisuals = { direction: "", images: [] };
      let prevOptions: VideoOptions | null = null;
      if (str(input.planId)) {
        const old = await getPlan(actor.userId, str(input.planId));
        if (!old) return failed("That plan isn't there. Ask for a new one.", "not_found");
        prev = ((old.totals as { choices?: typeof prev }).choices) ?? {};
        prevOptions = ((old.totals as { options?: VideoOptions }).options) ?? null;
        prevPicture = ((old.totals as { picture?: PlanPicture }).picture) ?? null;
        prevVisuals = visualsFrom(old.totals);
        const { data } = await createAdminClient().from("agent_plans").select("goal").eq("id", old.id).single();
        goal = `${(data as { goal: string | null } | null)?.goal ?? ""}\nChange: ${str(input.change)}`.trim();
        version = old.version + 1;
        await createAdminClient().from("agent_plans").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", old.id).eq("status", "proposed");
      }
      if (!goal) return needsInput("What would you like to make or get done?", "goal_required");
      // Read before the goal is cleaned; on an edit only the new change counts.
      const visualLabels = labeledVisuals(str(input.planId) ? str(input.change) : goal);
      const read = await readIntent(withoutVisualLabels(goal), ctx);
      if (read.clarify && read.topic.length < 8) return needsInput(read.clarify, "clarify");
      // The person's answers win (as fields, or in the exact labeled format),
      // then an edited plan's earlier choices. On an edit only the new change
      // is read for labels: the old goal's could undo a later answer.
      const labeled = labeledAnswers(str(input.planId) ? str(input.change) : goal);
      const intent = {
        ...read,
        city: str(input.city) || read.city,
        state: str(input.state).toUpperCase() || read.state,
        // Only real answers count, never the goal's loose wording (see Intent).
        shape: asShape(input.shape) ?? labeled.shape ?? asShape(prev.shape),
        presenter: asPresenter(input.presenter) ?? labeled.presenter ?? asPresenter(prev.presenter),
        style: asStyle(input.style) ?? labeled.style ?? asStyle(prev.style),
      };
      // Asked now, never guessed, and before anything can be approved.
      const { questions, style } = questionsFor(intent, ctx);
      const account = await accountOf(actor, ctx);
      if (questions.length) {
        return needsInput(
          `${account.line} Ask the user: ${questions.map((q) => q.options ? `${q.question} (${q.options.map((o) => o.label).join(" / ")})` : q.question).join(" ")} Wait for their answers; don't answer for them. Then call plan_spark again with the same goal and their answers in the shape, presenter and style fields. If you don't have those fields, end the goal with their answers in exactly this format: Shape: Wide. Presenter: Digital Twin. Style: Full.`,
          "choices_needed",
          { questions, account: { name: account.name, email: account.email } },
        );
      }
      intent.style = style;
      // A new answer replaces the old one; an edit that doesn't mention them keeps them.
      const askedLinks = imageLinks(input.images);
      const links = askedLinks.length ? askedLinks : visualLabels.images.length ? visualLabels.images : prevVisuals.images.map((i) => i.source);
      const { images, failed: badImages } = links.length && intent.kind === "video" && intent.presenter !== "camera"
        ? await imagesForPlan(actor.userId, links, prevVisuals.images)
        : { images: [], failed: [] as string[] };
      const visuals: PlanVisuals = {
        direction: cleanVisualDirection(input.showOnScreen) || visualLabels.direction || prevVisuals.direction,
        images,
      };
      const options = videoOptionsFrom(input, prevOptions);
      const { steps, totals, upgrade, notes, warnings } = buildPlan({ ...intent, visuals, options }, ctx);
      if (badImages.length) {
        warnings.push(`Couldn't use ${badImages.length === 1 ? "1 image link" : `${badImages.length} image links`} (up to ${MAX_PLAN_IMAGES} public https JPG, PNG or WebP images): ${badImages.join(", ")}`);
      }
      const summary = `${account.line}\n${summarize(steps, totals, notes, upgrade, warnings)}`;
      const place = placeFor(intent, ctx);
      const picture = await pictureForPlan(actor.userId, {
        topic: intent.topic, goal, shape: intent.shape ?? "wide", city: place?.city, state: place?.state,
        isListing: intent.isListing, previous: prevPicture,
      });
      const planTotals = { ...totals, ...(picture && { picture }) };
      const planId = await savePlan(actor, { goal, steps, totals: planTotals, summary, upgrade, version });
      return {
        status: "needs_approval", message: summary, planId,
        data: { account: { name: account.name, email: account.email }, planId, version, steps, totals, upgrade, notes, ...(warnings.length && { cantDo: warnings }), ...(picture && { picture: { url: picture.url, source: picture.source } }) },
      };
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
      const runnable = r.plan.steps.filter((s) => !s.comingSoon && !s.manual && !s.needsConfirm).map((s) => `${s.tool} (step ${s.n})`);
      const emailStep = r.plan.steps.find((s) => s.tool === "email_contacts");
      const scriptStep = r.plan.steps.find((s) => s.tool === "approve_script");
      return ok(r.plan.status === "approved"
        ? `Plan approved. Run these in order, each with planId and step: ${runnable.join(", ")}. Posting will ask for its own confirmation.`
          + (scriptStep ? ` After write_script, show the user the whole script word for word and wait: make_video runs only after they approve it with approve_script (step ${scriptStep.n}).` : "")
          + (emailStep ? ` When the video is finished, call find_contacts with planId and step ${emailStep.n}, let the user pick who gets it, then prepare_email and, only after they say send, confirm_email.` : "")
        : "Plan cancelled.", { planId: r.plan.id, status: r.plan.status, steps: r.plan.steps }, { planId: r.plan.id });
    },
  },
  {
    name: "write_script",
    scope: "sparks:write",
    description: "Writes the script for an approved plan step (planId + step) and saves it as a Spark draft in My Voice. Returns every word the video will say: the opening (hook), the script and the closing line, with a word count and a version. Show all of it to the user, unchanged, and wait for their approval. Without a planId it returns a one-step plan to approve first.",
    input: {
      type: "object",
      properties: {
        planId: { type: "string" }, step: { type: "number" },
        topic: { type: "string", description: "Only without a plan." },
        city: { type: "string", description: "Only without a plan: the town it's about." },
        state: { type: "string", description: "Only without a plan: 2-letter state." },
        closingLine: { type: "string", enum: ["settings", "none", "custom"], description: "Only without a plan: the closing line." },
        closingText: { type: "string", maxLength: 300, description: "Only without a plan, with closingLine custom." },
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
        // The closing line the plan says: from Settings, none, or their own words.
        const closing = (step.input.closing as { line?: string; text?: string } | undefined)
          ?? (str(step.input.closingLine) ? { line: str(step.input.closingLine), text: str(step.input.closingText) } : undefined);
        const forVideo = !!closing && step.input.camera !== true;
        if (closing && (closing.line === "settings" || closing.line === "none" || closing.line === "custom")) {
          await saveClosing(actor.userId, project.id, closing.line === "custom" && !closing.text ? "settings" : closing.line, closing.text);
        }
        const sp = await spokenScriptFor(createAdminClient(), actor.userId, project.id);
        return {
          ...ok(`Script written: "${project.title}".${forVideo ? ` ${REVIEW_ASK}` : ""}`, {
            sparkId: project.id,
            ...(sp ? scriptForReview(sp) : { title: project.title, hook: project.ai_script?.hook, script: project.ai_script?.script }),
            ...(step.input.camera === true && { openInSparkReels: recordLink(project.id) }),
          }),
          sparkId: project.id,
        };
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
      const res = fromService(r, "Script updated.");
      if (res.status !== "ok") return { ...res, audit: { sparkId: str(input.sparkId) } };
      // The saved script as it will now be spoken: a change needs a new approval.
      const sp = await spokenScriptFor(createAdminClient(), actor.userId, str(input.sparkId));
      return {
        ...ok(`Script updated. The saved script is under "current". ${REVIEW_ASK}`, { ...(res.data as object), ...(sp && { current: scriptForReview(sp) }) }),
        audit: { sparkId: str(input.sparkId) },
      };
    },
  },
  {
    name: "set_script",
    scope: "sparks:write",
    description: "Saves the user's own words to a Spark, word for word: the script (and optionally an opening hook), the closing line (settings, none or custom) and/or the title. Use it when the user gives or edits the script themselves. If their script already ends with their own closing, pass closingLine none. Returns every word the video will say and a new version to approve. Uses no videos.",
    input: {
      type: "object",
      properties: {
        sparkId: { type: "string" },
        script: { type: "string", maxLength: 6000, description: "The script exactly as the user gave it. Without hook, it's the whole spoken script before the closing line." },
        hook: { type: "string", maxLength: 300, description: "An opening line spoken before the script, only if the user gave one." },
        closingLine: { type: "string", enum: ["settings", "none", "custom"] },
        closingText: { type: "string", maxLength: 300, description: "With closingLine custom: the exact words." },
        title: { type: "string", maxLength: 150, description: "The video's title, if the user gave one. Never spoken." },
      },
      required: ["sparkId"],
    },
    async run(actor, _ctx, input) {
      const admin = createAdminClient();
      const sparkId = str(input.sparkId);
      const { data } = await admin.from("projects").select("ai_script").eq("id", sparkId).eq("user_id", actor.userId).maybeSingle();
      if (!data) return failed("That Spark isn't in your account.", "not_yours");
      const script = typeof input.script === "string" ? input.script.trim().slice(0, 6000) : null;
      const hook = typeof input.hook === "string" ? input.hook.trim().slice(0, 300) : null;
      const closing = str(input.closingLine) as ClosingChoice | "";
      const closingText = str(input.closingText).slice(0, 300);
      const title = str(input.title).slice(0, 150);
      if (script === "" ) return needsInput("The script can't be empty.", "script_required");
      if (script === null && hook === null && !closing && !closingText && !title) return needsInput("What should change? Give the script, hook, closing line or title.", "nothing_to_save");
      if (closing === "custom" && !closingText) return needsInput("What should the closing line say? Give closingText.", "closing_text_required");
      const ai = ((data as { ai_script: Record<string, unknown> | null }).ai_script) ?? {};
      const choice: ClosingChoice | null = closing || (closingText ? "custom" : null);
      const patch = draftScriptPatch(ai, {
        // Their script replaces the opening too, unless they gave one: nothing they didn't write is spoken first.
        ...(script !== null && { script, hook: hook ?? "" }),
        ...(script === null && hook !== null && { hook }),
        ...(choice === "none" && { ctaOff: true }),
        ...(choice === "custom" && { ctaOff: false, cta: closingText, ctaEdited: true }),
        ...(choice === "settings" && { ctaOff: false, ctaEdited: false }),
      });
      const { error } = await admin.from("projects").update({ ai_script: { ...patch, ...(title && { title }) }, ...(title && { title }) }).eq("id", sparkId).eq("user_id", actor.userId);
      if (error) return failed("Couldn't save the script. Try again.", "save_failed");
      const sp = await spokenScriptFor(admin, actor.userId, sparkId);
      return { ...ok(`Saved word for word. ${REVIEW_ASK}`, { sparkId, ...(sp && scriptForReview(sp)) }), audit: { sparkId } };
    },
  },
  {
    name: "show_script",
    scope: "sparks:write",
    description: "Every word a Spark's video will say (opening, script, closing line), its word count, version, and whether the user has approved this version. Uses nothing.",
    input: { type: "object", properties: { sparkId: { type: "string" } }, required: ["sparkId"] },
    async run(actor, _ctx, input) {
      const sp = await spokenScriptFor(createAdminClient(), actor.userId, str(input.sparkId));
      if (!sp) return failed("That Spark isn't in your account.", "not_yours");
      const approved = await scriptApproved(actor.userId, str(input.sparkId), sp.version);
      return ok(approved ? "This version is approved." : `Not approved yet. ${REVIEW_ASK}`, { sparkId: str(input.sparkId), ...scriptForReview(sp), approved });
    },
  },
  {
    name: "approve_script",
    scope: "sparks:write",
    description: "Records that the user read and approved this exact script (sparkId + the version you showed them). Call it only after they say they approve it. Any later change to the opening, script or closing line needs a new approval. Returns everything the video will be made with. Uses no videos.",
    input: {
      type: "object",
      properties: {
        sparkId: { type: "string" },
        version: { type: "string", description: "The version from the script you showed the user." },
        planId: { type: "string", description: "The approved plan, so the video's settings can be listed." },
      },
      required: ["sparkId", "version"],
    },
    async run(actor, ctx, input) {
      const sparkId = str(input.sparkId);
      const sp = await spokenScriptFor(createAdminClient(), actor.userId, sparkId);
      if (!sp) return failed("That Spark isn't in your account.", "not_yours");
      if (str(input.version) !== sp.version) {
        return needsInput(`The script isn't the version you showed (it's now ${sp.version}). Nothing was approved. ${REVIEW_ASK}`, "script_changed", { sparkId, ...scriptForReview(sp) });
      }
      const claim = await claimAction(actor, { tool: "approve_script", kind: "create", requestId: approvalKey(sparkId, sp.version), payload: { sparkId, version: sp.version } });
      if (claim.kind === "conflict") return failed("Couldn't record the approval. Try again.", "approval_conflict");
      if (claim.kind === "new") await finishAction(claim.actionId, "succeeded", { sparkId, version: sp.version, words: sp.words });
      else if (claim.status !== "succeeded") await finishAction(claim.actionId, "succeeded", { sparkId, version: sp.version, words: sp.words });
      const plan = str(input.planId) ? await getPlan(actor.userId, str(input.planId)) : null;
      const videoStep = plan?.steps.find((s) => s.tool === "make_video");
      if (!videoStep) return ok(`Script approved (version ${sp.version}). The video can be made now.`, { sparkId, version: sp.version, approved: true });
      const settings = await videoSettings(actor, ctx, videoStep.input, sp);
      return ok(
        `Script approved (version ${sp.version}). This is what the video will be made with. Tell the user, then call make_video with planId and step ${videoStep.n}: ${settingsLine(settings)}.`,
        { sparkId, version: sp.version, approved: true, willMake: settings },
      );
    },
  },
  {
    name: "make_video",
    scope: "videos:create",
    description: "Starts the video for an approved plan step (planId + step), only after the user approved the script with approve_script. Uses one of the plan's videos, through SparkReels' normal render queue, with exactly the plan's settings. Check progress with video_status. Outside a plan, pass sparkId with the user's shape, presenter and style (and music, captions, contactCard if they said).",
    input: {
      type: "object",
      properties: {
        planId: { type: "string" }, step: { type: "number" }, sparkId: { type: "string" },
        shape: { type: "string", enum: ["vertical", "wide"] },
        presenter: { type: "string", enum: ["twin", "headshot", "voice_only", "camera"] },
        style: { type: "string", enum: ["full", "circle", "cinematic"] },
        music: { type: "string", enum: MUSIC_CHOICES, description: "Only outside a plan: background music. Inspiring when not given." },
        captions: { type: "boolean", description: "Only outside a plan. On when not given." },
        contactCard: { type: "boolean", description: "Only outside a plan. On when not given." },
      },
    },
    async run(actor, ctx, input) {
      let args = input;
      let title = "Make the video";
      if (!str(input.planId)) {
        // Outside a plan the same choices apply: asked, never guessed.
        const shape = asShape(input.shape);
        const presenter = asPresenter(input.presenter);
        if (presenter === "camera" && str(input.sparkId)) {
          return ok(`Recording yourself happens in SparkReels. Open it on the teleprompter: ${recordLink(str(input.sparkId))}`, { openInSparkReels: recordLink(str(input.sparkId)) });
        }
        const people = presenterOptions(ctx);
        if (!shape || !presenter || !people.includes(presenter)) {
          return needsInput(`Ask the user: Vertical or wide? Who's on screen (${people.join(" / ")})?`, "choices_needed");
        }
        const styles = styleOptions(ctx, presenter);
        const style = styles.length === 1 ? styles[0] : asStyle(input.style);
        if (styles.length > 1 && (!style || !styles.includes(style))) {
          return needsInput(`Ask the user which style: ${styles.map(styleLabel).join(", ")}?`, "choices_needed");
        }
        const o = videoOptionsFrom(input);
        args = {
          sparkId: str(input.sparkId), size: shape, voiceOnly: presenter === "voice_only", presenter, style: styles.length ? style : null,
          music: o.music, captions: o.captions, contactCard: typeof input.contactCard === "boolean" ? input.contactCard : true,
        };
        title = `Make the video: ${videoLabel(shape, presenter, styles.length ? style : null)} (${finishLabel({ ...o, contactCard: args.contactCard as boolean }, styles.length ? style : null)})`;
      }
      // No video until the user approved these exact words (2026-11-25).
      const gateSpark = await videoSparkFor(actor.userId, input);
      if (gateSpark) {
        const sp = await spokenScriptFor(createAdminClient(), actor.userId, gateSpark);
        if (sp && !(await scriptApproved(actor.userId, gateSpark, sp.version))) {
          return needsInput(`The user hasn't approved this script yet, so no video was started. ${REVIEW_ASK}`, "script_not_approved", { sparkId: gateSpark, ...scriptForReview(sp) });
        }
      }
      return runCreationStep(actor, ctx, "make_video", args, async (step, planId) => {
        const sparkId = await sparkFor(actor.userId, planId, step.input);
        if (!sparkId) return failed("Write the script first: the video needs a Spark draft.", "spark_required");
        const shape: Shape = step.input.size === "vertical" ? "vertical" : "wide";
        const presenter = asPresenter(step.input.presenter);
        const lookId = await lookFor(ctx, presenter, shape);
        if (presenter && presenter !== "voice_only" && !lookId) {
          return failed(presenter === "twin" ? "Your Digital Twin isn't ready. Check it in Settings." : "Add a headshot in Settings first.", "look_missing");
        }
        // The approved words: the closing line goes to the render as approved.
        const sp = await spokenScriptFor(createAdminClient(), actor.userId, sparkId);
        if (!sp) return failed("That Spark isn't in your account.", "not_yours");
        const settings = await videoSettings(actor, ctx, step.input, sp);
        const music = str(step.input.music) || "inspiring";
        const captions = step.input.captions !== false;
        // Cinematic AI Avatar (2026-11-25): the editor's own build, Digital Twin only.
        if ((step.input.style as VideoStyle | null) === "cinematic") {
          if (presenter !== "twin") return failed("Cinematic AI Avatar is made with your Digital Twin.", "twin_required");
          const r = await renderSparkCinematic(createAdminClient(), { id: actor.userId }, sparkId, {
            size: shape === "vertical" ? "vertical" : "horizontal", lookId, captions, music,
          } as unknown as HaloSetup, { cta: sp.closingLine });
          if (r.status >= 400) return failed(String(r.out.error ?? "Couldn't start the video."), String(r.out.code ?? `http_${r.status}`));
          return {
            ...ok(`The Cinematic AI Avatar video is building: ${String(r.out.scenes ?? "")} scenes, a new place for each line. It usually takes 5 to 15 minutes. Check video_status. Made with: ${settingsLine(settings)}.`, { sparkId, videoId: r.out.videoId, madeWith: settings }),
            sparkId,
          };
        }
        // Only from the approved plan, where each image is already a copy in their storage.
        const images = Array.isArray(step.input.images) ? (step.input.images as unknown[]).filter((u): u is string => typeof u === "string") : [];
        const setup = {
          size: shape === "vertical" ? "vertical" : "horizontal",
          voiceOnly: step.input.voiceOnly === true,
          look: (step.input.style as VideoStyle | null) === "circle" ? "circle" : "full",
          lookId,
          captions,
          music,
          ...(images.length && { onScreen: "post", photos: images }),
        } as unknown as HaloSetup;
        const r = await renderSparkVideo(createAdminClient(), { id: actor.userId, email: await userEmail(actor.userId) }, sparkId, setup, {
          visualDirection: cleanVisualDirection(step.input.visualDirection) || undefined,
          cta: sp.closingLine,
          ...(step.input.contactCard === false && { contactCard: false }),
        });
        if (r.status >= 400) return failed(String(r.out.error ?? "Couldn't start the video."), String(r.out.code ?? `http_${r.status}`));
        return {
          ...ok(`${r.out.queued ? "The video is in line to render." : "The video is rendering."} Check video_status in a few minutes. Made with: ${settingsLine(settings)}.`, { sparkId, queued: r.out.queued === true, madeWith: settings }),
          sparkId,
        };
      }, { title, usesVideo: true });
    },
  },
  {
    name: "video_status",
    scope: "videos:read",
    description: "Whether a video is rendering, ready (with its link) or failed (with a plain reason). Give the sparkId or videoId.",
    input: { type: "object", properties: { sparkId: { type: "string" }, videoId: { type: "string" } } },
    async run(actor, _ctx, input) {
      const admin = createAdminClient();
      let q = admin.from("generated_videos").select("id, render_job_id, project_id, render_provider, metadata").eq("user_id", actor.userId);
      q = str(input.videoId) ? q.eq("id", str(input.videoId)) : q.eq("project_id", str(input.sparkId));
      const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      const v = data as { id: string; render_job_id: string | null; project_id: string | null; render_provider: string | null; metadata: { visual_direction_note?: string } | null } | null;
      if (!v?.render_job_id) return failed("No video found for that Spark yet.", "not_found");
      const r = await getRenderStatus(actor.userId, v.render_job_id);
      // The service's progress is a fixed 50% while rendering (the app's bar
      // builds on it), so an AI client must never be handed it as a real number.
      const { progress: _progress, progressPct: _pct, ...b } = (r.body ?? {}) as { status?: string; url?: string; error?: string; progress?: unknown; progressPct?: unknown };
      const note = v.metadata?.visual_direction_note;
      const directionNote = note === "left_out" ? " Your on-screen direction was left out because the script needed the room."
        : note === "shortened" ? " Only part of your on-screen direction fit beside the script." : "";
      const message = b.status === "completed" ? "The video is ready." : b.status === "failed" ? `The video failed: ${b.error ?? "unknown reason"}.` : renderingMessage(v.render_provider);
      return { ...ok(`${message}${directionNote}`, { videoId: v.id, sparkId: v.project_id, ...b }), audit: { videoId: v.id, sparkId: v.project_id } };
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
        // Recording yourself: the last AI step, so this is where the link back goes.
        if (step.input.camera === true && r.status < 400) {
          const link = recordLink(sparkId);
          return { ...ok(`${CAMERA_READY_NOTE}\nOpen in SparkReels → ${link}`, { ...(r.body as object), openInSparkReels: link }), sparkId };
        }
        return { ...fromService(r, "Social copy written."), sparkId };
      }, { title: "Write the social copy", usesVideo: false });
    },
  },
  {
    name: "publish_video",
    scope: "publish:write",
    description: "Step 1 of posting now: prepares the exact post (finished video, destinations, title and text) and returns an actionId. Posts nothing. Show the preview's title and text exactly; never show a different title. An account the video is already on is left out and the result says so. Only after the user confirms, call confirm_publish.",
    input: {
      type: "object",
      properties: {
        videoId: { type: "string" }, sparkId: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, requestId: { type: "string" },
        postAgain: { type: "boolean", description: "Only if the user was told it's already posted and clearly asked for a second copy." },
      },
    },
    async run(actor, ctx, input) { return preparePublish(actor, ctx, input, false); },
  },
  {
    name: "schedule_video",
    scope: "publish:write",
    description: "Step 1 of scheduling: prepares the exact post (title and text included) with a local date and time (\"when\": \"YYYY-MM-DDTHH:mm\") in the user's SparkReels time zone and returns an actionId. Posts nothing. Show the preview's title and text exactly. An account the video is already on is left out and the result says so. If the time zone is missing it asks for one.",
    input: {
      type: "object",
      properties: {
        videoId: { type: "string" }, sparkId: { type: "string" }, platforms: { type: "array", items: { type: "string" } },
        when: { type: "string" }, timeZone: { type: "string" }, requestId: { type: "string" },
        postAgain: { type: "boolean", description: "Only if the user was told it's already posted and clearly asked for a second copy." },
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
      const a = data as { id: string; kind: string; status: string; payload: { videoId: string; targets: { platform: string }[]; scheduledAt?: string; postAgain?: boolean }; expires_at: string | null } | null;
      // A publish confirmation can only ever carry out a publish action.
      if (!a || a.kind !== "publish") return failed("That isn't a post waiting for confirmation.", "not_found");
      if (a.status === "succeeded") return ok("Already posted.", undefined, { actionId: a.id });
      if (a.status !== "prepared") return failed(`That post is ${a.status}.`, `action_${a.status}`);
      if (a.expires_at && Date.parse(a.expires_at) < Date.now()) {
        await admin.from("agent_actions").update({ status: "expired" }).eq("id", a.id).eq("status", "prepared");
        return failed("That confirmation expired. Prepare the post again.", "action_expired");
      }
      // Checked again here: it may have been posted from My Sparks since this was prepared.
      if (!a.payload.postAgain) {
        const live = await livePosts(admin, actor.userId, a.payload.videoId, a.payload.targets.map((t) => t.platform));
        if (!live) return failed("Couldn't check where this video is already posted, so nothing was posted. Try again in a moment.", "post_check_failed");
        if (live.length) {
          await admin.from("agent_actions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", a.id).eq("status", "prepared");
          return needsInput(
            `Not posted: this video is ${liveSummary(live, label)}. Tell the user. Only if they then clearly ask for a second copy, prepare it again with postAgain: true.`,
            "already_posted",
            { alreadyPosted: live.map((l) => ({ platform: label(l.platform), status: l.status, at: l.at })) },
          );
        }
      }
      if (a.payload.targets.some((t) => !ctx.connected.includes(t.platform))) {
        return failed("One of those accounts is no longer connected. Prepare the post again.", "platform_disconnected");
      }
      // prepared → running, once: a second confirm can't post twice.
      const { data: claimed } = await admin.from("agent_actions")
        .update({ status: "running", confirmed_via: "confirm_tool", updated_at: new Date().toISOString() })
        .eq("id", a.id).eq("status", "prepared").select("id").maybeSingle();
      if (!claimed) return failed("That post is already being sent.", "action_running");
      const { postAgain: _postAgain, ...toPublish } = a.payload;
      const r = await publishToTargets(actor.userId, toPublish as never);
      const body = (r.body ?? {}) as Record<string, unknown>;
      await finishAction(a.id, r.status < 400 ? "succeeded" : "failed", body);
      return {
        ...(r.status < 400 ? ok(a.payload.scheduledAt ? "Scheduled." : "Posted.", body, { actionId: a.id }) : failed(String(body.error ?? "Nothing could be posted."), "publish_failed")),
        audit: { videoId: a.payload.videoId, publishRef: Array.isArray(body.pendingRefs) ? String((body.pendingRefs as string[])[0] ?? "") : null, approvalState: "confirmed" },
      };
    },
  },
  // ── Email it to BoldTrail contacts (2026-11-25, the owner's approved plan, V1.1) ──
  // find_contacts lists, prepare_email shows the exact email, confirm_email sends
  // once. Approving a plan never sends. Email it's own code (sendVideoEmail) does
  // the sending: reused, never copied.
  {
    name: "find_contacts",
    scope: "contacts:email",
    description: "Lists the user's BoldTrail contacts to choose from, by status (new, client, closed, sphere, active, under contract, prospect), type (buyer, seller, renter, agent, vendor) and/or part of a name. Up to 25, with names and status only. Sends nothing. Show the names and ask who should get the email (up to 10), then call prepare_email with this listId and their ids.",
    input: {
      type: "object",
      properties: {
        status: { type: "string", description: "One of: new, client, closed, sphere, active, under contract, prospect." },
        type: { type: "string", description: "One of: buyer, seller, renter, agent, vendor." },
        search: { type: "string", description: "Part of a first name, last name or email." },
        planId: { type: "string" }, step: { type: "number" },
      },
    },
    async run(actor, ctx, input) {
      const admin = createAdminClient();
      const token = await loadBoldTrailToken(admin, actor.userId);
      if (!token) return needsInput("BoldTrail isn't connected. Connect it in SparkReels Settings first.", "boldtrail_not_connected");
      // The plan's step may carry the filter; what the user says now wins.
      const plan = str(input.planId) ? await getPlan(actor.userId, str(input.planId)) : null;
      const fromPlan = plan?.steps.find((s) => s.tool === "email_contacts")?.input ?? {};
      const wanted = crmWanted(str(input.status) || null, str(input.type) || null);
      const filter = cleanFilter({
        status: str(input.status) ? wanted.crmStatus : fromPlan.status,
        type: str(input.type) ? wanted.crmType : fromPlan.type,
      });
      const search = str(input.search);
      if (search.length < 2 && filter.status === null && !filter.type) {
        return needsInput("Which contacts? Give a status (like closed), a type (like seller) or part of a name.", "filter_required");
      }
      const found = await findContacts(token, search, filter).catch(() => null);
      if (!found) return failed("Couldn't reach BoldTrail just now. Try again in a moment.", "boldtrail_error");
      if (!found.contacts.length) return ok(`No ${contactsPhrase(filter.status, filter.type).replace(/^your /, "")} found in BoldTrail.`, { contacts: [] });
      // Kept on our side, so an email can only go to someone the user saw listed.
      const payload = { filter, search, contacts: found.contacts };
      const claim = await claimAction(actor, {
        tool: "find_contacts", kind: "crm_send", requestId: requestIdFor(actor, "find_contacts", { filter, search }), payload,
        planId: plan?.id ?? null, step: Number(input.step) || null,
      });
      if (claim.kind === "conflict" || (claim.kind === "repeat" && claim.status !== "running" && claim.status !== "succeeded")) {
        return failed("Couldn't keep that list. Ask again in a moment.", "list_conflict");
      }
      if (claim.kind === "new") await finishAction(claim.actionId, "succeeded", payload);
      const list = claim.kind === "repeat" && claim.status === "succeeded" ? (claim.result as typeof payload).contacts : found.contacts;
      return ok(
        `${found.total && found.total > list.length ? `Showing ${list.length} of ${found.total}` : `${list.length} found`}. Ask who should get it (up to ${VIDEO_EMAIL_MAX}).`,
        { listId: claim.actionId, contacts: list.map((c) => ({ id: c.id, name: c.name, tag: contactTag(c) })), total: found.total },
        { actionId: claim.actionId },
      );
    },
  },
  {
    name: "prepare_email",
    scope: "contacts:email",
    description: "Step 1 of emailing a finished video to chosen BoldTrail contacts: takes the listId from find_contacts and the ids the user chose (up to 10), writes the subject and note unless given, and returns an actionId with the exact email. Sends nothing. Show the names, subject and note exactly, then call confirm_email only after the user says send.",
    input: {
      type: "object",
      properties: {
        listId: { type: "string" }, contactIds: { type: "array", items: { type: "string" } },
        videoId: { type: "string" }, sparkId: { type: "string" },
        subject: { type: "string" }, note: { type: "string" },
        planId: { type: "string" }, step: { type: "number" }, requestId: { type: "string" },
      },
      required: ["listId", "contactIds"],
    },
    async run(actor, ctx, input) {
      const admin = createAdminClient();
      if ((await staffLimits(actor.userId))?.emails === false) return failed(STAFF_NO_EMAIL, "staff_access");
      const { data: listRow } = await admin.from("agent_actions").select("id, tool, status, result").eq("id", str(input.listId)).eq("user_id", actor.userId).maybeSingle();
      const listed = ((listRow as { tool: string; status: string; result: { contacts?: FoundContact[] } | null } | null)?.tool === "find_contacts"
        ? (listRow as { result: { contacts?: FoundContact[] } | null }).result?.contacts ?? [] : []);
      if (!listed.length) return needsInput("List the contacts first with find_contacts.", "list_required");
      const ids = Array.from(new Set((Array.isArray(input.contactIds) ? input.contactIds : []).map(String)));
      if (!ids.length) return needsInput("Who should get it? Give the ids of the people the user chose.", "contacts_required");
      if (ids.length > VIDEO_EMAIL_MAX) return needsInput(`Up to ${VIDEO_EMAIL_MAX} people at a time. Ask which ${VIDEO_EMAIL_MAX}.`, "too_many");
      const chosen = ids.map((id) => listed.find((c) => c.id === id)).filter((c): c is FoundContact => !!c);
      if (chosen.length !== ids.length) return needsInput("Some of those people weren't in the list. Use ids from find_contacts.", "not_listed");

      let videoId = str(input.videoId);
      if (!videoId && str(input.sparkId)) {
        const { data } = await admin.from("generated_videos").select("id").eq("user_id", actor.userId).eq("project_id", str(input.sparkId))
          .eq("render_status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
        videoId = (data as { id: string } | null)?.id ?? "";
      }
      if (!videoId) return needsInput("Which video? Give a videoId or the sparkId of a finished video.", "video_required");
      const { data: v } = await admin.from("generated_videos")
        .select("id, render_status, video_url, projects(title, ai_script, seo_data, location_city, location_state)")
        .eq("id", videoId).eq("user_id", actor.userId).maybeSingle();
      const video = v as unknown as { id: string; render_status: string; video_url: string | null; projects: Record<string, unknown> | Record<string, unknown>[] | null } | null;
      if (!video) return failed("That video isn't in your account.", "not_yours");
      if (video.render_status !== "completed" || !/^https:\/\//.test(video.video_url ?? "")) return failed("That video isn't finished yet. Try again when it's ready.", "video_not_ready");

      // The subject and note Email it writes, unless the user gave their own.
      let subject = str(input.subject).slice(0, 150);
      let note = str(input.note).slice(0, 3000);
      if (!subject || !note) {
        const project = (Array.isArray(video.projects) ? video.projects[0] : video.projects) as {
          title?: string | null; ai_script?: { script?: string } | null; seo_data?: { description?: string } | null; location_city?: string | null; location_state?: string | null;
        } | null;
        const signature = await loadAgentSignature(admin, actor.userId);
        const written = await writeVideoEmail({
          title: project?.title || "My latest video",
          about: project?.seo_data?.description || project?.ai_script?.script || null,
          agentName: signature.name,
          market: [project?.location_city, project?.location_state].filter(Boolean).join(", ") || null,
        });
        if (!written) return failed("Couldn't write the note just now. Try again, or give a subject and note.", "write_failed");
        subject ||= written.subject;
        note ||= written.note;
      }

      const payload = { videoId, subject, note, contacts: chosen.map((c) => ({ id: c.id, name: c.name, email: c.email })) };
      const expiresAt = new Date(Date.now() + PUBLISH_CONFIRM_MINUTES * 60_000).toISOString();
      const claim = await claimAction(actor, {
        tool: "prepare_email", kind: "crm_send", requestId: requestIdFor(actor, "prepare_email", payload, str(input.requestId) || null),
        payload, status: "prepared", expiresAt, planId: str(input.planId) || null, step: Number(input.step) || null,
      });
      if (claim.kind === "conflict") return failed("That request id was already used for something different.", "idempotency_conflict");
      if (claim.kind === "repeat" && claim.status !== "prepared") return failed(`That same email was just tried and is ${claim.status}.`, `action_${claim.status}`);
      const names = chosen.map((c) => c.name);
      return {
        status: "needs_approval",
        message: `Ready to email this video to ${names.join(", ")} through BoldTrail. Subject: "${subject}". Nothing has gone out yet. Send ${names.length === 1 ? "this email" : `these ${names.length} emails`}? This expires in ${PUBLISH_CONFIRM_MINUTES} minutes.`,
        actionId: claim.actionId,
        // Exactly what will go out. Show these words; don't substitute others.
        data: { actionId: claim.actionId, to: names, subject, note, video: { id: videoId, url: video.video_url }, expiresAt },
      };
    },
  },
  {
    name: "confirm_email",
    scope: "contacts:email",
    description: "Step 2: sends a prepared email (actionId) to the chosen contacts, only after the user said send to that exact list, subject and note. Works once; expires 30 minutes after it was prepared.",
    input: { type: "object", properties: { actionId: { type: "string" } }, required: ["actionId"] },
    async run(actor, ctx, input) {
      const admin = createAdminClient();
      const { data } = await admin.from("agent_actions").select("id, kind, tool, status, payload, expires_at").eq("id", str(input.actionId)).eq("user_id", actor.userId).maybeSingle();
      const a = data as { id: string; kind: string; tool: string; status: string; payload: { videoId: string; subject: string; note: string; contacts: { id: string; name: string; email: string }[] }; expires_at: string | null } | null;
      // An email confirmation can only ever carry out a prepared email.
      if (!a || a.kind !== "crm_send" || a.tool !== "prepare_email") return failed("That isn't an email waiting for confirmation.", "not_found");
      if (a.status === "succeeded") return ok("Already sent.", undefined, { actionId: a.id });
      if (a.status !== "prepared") return failed(`That email is ${a.status}.`, `action_${a.status}`);
      if (a.expires_at && Date.parse(a.expires_at) < Date.now()) {
        await admin.from("agent_actions").update({ status: "expired" }).eq("id", a.id).eq("status", "prepared");
        return failed("That confirmation expired. Prepare the email again.", "action_expired");
      }
      if ((await staffLimits(actor.userId))?.emails === false) return failed(STAFF_NO_EMAIL, "staff_access");
      // prepared → running, once: a second confirm can't send twice.
      const { data: claimed } = await admin.from("agent_actions")
        .update({ status: "running", confirmed_via: "confirm_tool", updated_at: new Date().toISOString() })
        .eq("id", a.id).eq("status", "prepared").select("id").maybeSingle();
      if (!claimed) return failed("That email is already being sent.", "action_running");
      const r = await sendVideoEmail(admin, { id: actor.userId, email: await userEmail(actor.userId) }, a.payload);
      await finishAction(a.id, r.status < 400 ? "succeeded" : "failed", r.body);
      const results = (r.body.results ?? []) as { name: string; sent: boolean; via?: string }[];
      const sent = results.filter((x) => x.sent).map((x) => x.name);
      const missed = results.filter((x) => !x.sent).map((x) => x.name);
      const viaBt = results.every((x) => x.via === "boldtrail");
      return {
        ...(r.status < 400
          ? ok(`Sent ${sent.length} ${sent.length === 1 ? "email" : "emails"}${viaBt ? " through BoldTrail" : ""}${missed.length ? `. Not sent: ${missed.join(", ")}` : ""}.${viaBt ? " Each is logged on the contact." : ""}`, { sent, notSent: missed }, { actionId: a.id })
          : failed(String(r.body.error ?? "Nothing could be sent."), "send_failed")),
        audit: { videoId: a.payload.videoId, approvalState: "confirmed" },
      };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
