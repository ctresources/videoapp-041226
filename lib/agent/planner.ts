import { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";
import { partnerPlatform } from "@/lib/utils/social-platforms";
import { formatWhen, zonedToUtc } from "@/lib/utils/time-zone";
import { type AgentContext, videosLeft } from "@/lib/agent/context";
import { planHash, type PlanStep } from "@/lib/agent/approvals";
import { canUseDigitalTwin, canUseTwinInFullVideo } from "@/lib/utils/plan-features";
import type { AgentActor } from "@/lib/agent/types";

/**
 * plan_spark: the brain (plan revision 5). A goal ("Market my listing",
 * "Keep me visible to sellers in Blue Bell this week") becomes a recommended
 * Spark plan. Nothing is created, no credit is used.
 *
 * Two parts, on purpose:
 * 1. Understanding the goal: a model reads it into a small, fixed intent
 *    (topic, what to make, where, when). It never chooses tools.
 * 2. Building the plan: plain code turns that intent into steps, using only
 *    what this account can actually run (plan, videos left, features,
 *    connected platforms). Anything useful it can't run is shown separately
 *    as an upgrade opportunity, never folded in silently.
 *
 * Publishing and scheduling steps are marked needsConfirm: approving the
 * plan never posts anything (approval condition B).
 */

export type Shape = "vertical" | "wide";
/** "camera" is the agent recording themselves, in SparkReels, on the teleprompter. */
export type Presenter = "twin" | "headshot" | "voice_only" | "camera";
export type VideoStyle = "full" | "circle";

export interface Intent {
  topic: string;
  /** The town the goal names, if any. It wins over the saved market. */
  city?: string | null;
  state?: string | null;
  kind: "video" | "blog_only";
  wantsBlog: boolean;
  wantsSocialCopy: boolean;
  /** About one specific property: its picture must be a real photo of it. */
  isListing?: boolean;
  /**
   * Null until the person has answered. Only ever set from the tool's own
   * answer fields, never read out of the goal: an AI client rewrites the goal
   * ("short video") and that wording isn't the person's choice (2026-11-22).
   */
  shape: Shape | null;
  presenter: Presenter | null;
  style: VideoStyle | null;
  platforms: string[];
  /** Local wall time, "YYYY-MM-DDTHH:mm", when the goal names one. */
  when: string | null;
  crmFollowUp: boolean;
  clarify: string | null;
}

const INTENT_SYSTEM = `You read a real estate agent's goal and return what content they want. You do not write the content.
Return ONLY JSON: {"topic": "...", "city": "town named in the goal" | null, "state": "2-letter state" | null, "kind": "video" | "blog_only", "wantsBlog": bool, "wantsSocialCopy": bool, "isListing": bool, "platforms": ["youtube","instagram","facebook","linkedin","tiktok","x","threads","google_business"], "when": "YYYY-MM-DDTHH:mm" | null, "crmFollowUp": bool, "clarify": "one short question" | null}
- topic: ONLY the subject of the video in plain words, including the town if given. For "market my listing", the listing's address or description if given. Leave out instructions about planning, approval, format, length, tone or who is on screen.
- city, state: only a place named in the goal itself, never the agent's market. Give the state only if the goal says it or the town is unmistakable; otherwise null.
- Default kind "video".
- isListing: true only if it's about one specific property for sale (a listing, an address, "my listing").
- wantsSocialCopy true unless they say otherwise. wantsBlog true for market updates, guides and listings.
- platforms: only ones they named; [] means "where they're connected".
- when: only if they named a day or time. Today is {today} in {tz}.
- crmFollowUp: true if they mention their database, past clients, contacts, BoldTrail, GHL or follow-up.
- clarify: only if the goal is too vague to pick a topic.
${FAIR_HOUSING_SHORT}`;

export const asShape = (v: unknown): Shape | null => (v === "vertical" || v === "wide" ? v : null);
export const asPresenter = (v: unknown): Presenter | null =>
  (v === "twin" || v === "headshot" || v === "voice_only" || v === "camera" ? v : null);
export const asStyle = (v: unknown): VideoStyle | null => (v === "full" || v === "circle" ? v : null);

/**
 * Only the subject goes into the script and title. An AI client can pass its
 * own working notes in the goal ("…; plan for approval only", seen in the
 * first live test, 2026-11-22). Narrow on purpose: "don't overprice your
 * home" is a real topic.
 */
export function cleanTopic(raw: string): string {
  const t = raw
    .replace(/\s*[,;:.–—-]?\s*\b(?:show\s+(?:the\s+)?)?(?:plan\s+(?:it\s+)?)?for approval(?: only)?\b.*$/i, "")
    .replace(/\s*[,;:.–—-]?\s*\b(?:do not|don'?t)\s+(?:create|make|publish|post)\s+(?:anything|it|this|yet)\b.*$/i, "")
    // Choices a client wrote into the goal ("Style: Full video. Presenter: …").
    .replace(/\s*[,;.]?\s*\b(?:style|presenter|format|shape|tone)\s*:\s*[^.;]*[.;]?/gi, " ")
    .replace(/^\s*(?:please\s+)?plan\s+(?:a|an|me a)\s+(?:new\s+)?/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,;:.–—-]+$/, "")
    .trim();
  // The script gets the whole subject; only a runaway paste is limited.
  return t.length <= 500 ? t : t.slice(0, t.lastIndexOf(" ", 500) > 300 ? t.lastIndexOf(" ", 500) : 500).trim();
}

/** The topic as shown in a plan's step title. The script still gets all of it. */
export function shortTopic(topic: string, max = 90): string {
  if (topic.length <= max) return topic;
  const cut = topic.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max).trim()}…`;
}

/** What this account can pick, using the same plan rules the render enforces. */
function twinRules(ctx: AgentContext) {
  const role = ctx.allowance.isAdmin ? "admin" : null;
  return {
    full: canUseTwinInFullVideo(ctx.allowance.tier, role),
    circle: canUseDigitalTwin(ctx.allowance.tier, role),
  };
}

const PRESENTER_LABEL: Record<Presenter, string> = {
  twin: "Digital Twin",
  headshot: "Headshot avatar",
  voice_only: "Voice only",
  camera: "Yourself on camera",
};
const STYLE_LABEL: Record<VideoStyle, string> = {
  full: "Full video with b-roll",
  circle: "Corner circle over scenes",
};

export function presenterOptions(ctx: AgentContext): Presenter[] {
  const rules = twinRules(ctx);
  return [
    ...(ctx.ready.twin && (rules.full || rules.circle) ? ["twin" as const] : []),
    ...(ctx.ready.photoAvatar ? ["headshot" as const] : []),
    "voice_only",
    "camera",
  ];
}

/** Style only applies to an avatar on screen. */
export function styleOptions(ctx: AgentContext, presenter: Presenter): VideoStyle[] {
  if (presenter === "headshot") return ["full", "circle"];
  if (presenter !== "twin") return [];
  const rules = twinRules(ctx);
  return [...(rules.full ? ["full" as const] : []), ...(rules.circle ? ["circle" as const] : [])];
}

export interface PlanQuestion {
  field: "shape" | "presenter" | "style" | "town";
  question: string;
  options?: { value: string; label: string }[];
}

/**
 * What must be asked before a plan can be built. Shape and who's on screen
 * are the person's choice; only what this account can really use is offered.
 * A style with a single possibility is filled in rather than asked.
 */
export function questionsFor(intent: Intent, ctx: AgentContext): { questions: PlanQuestion[]; style: VideoStyle | null } {
  const questions: PlanQuestion[] = [];
  if (needsPlace(ctx) && !placeFor(intent, ctx)) {
    questions.push({ field: "town", question: "What town and state is this for?" });
  }
  let style = intent.style;
  if (intent.kind === "video") {
    if (!intent.shape) {
      questions.push({ field: "shape", question: "Vertical or wide?", options: [{ value: "vertical", label: "Vertical" }, { value: "wide", label: "Wide" }] });
    }
    const people = presenterOptions(ctx);
    const presenter = intent.presenter && people.includes(intent.presenter) ? intent.presenter : null;
    if (!presenter) {
      questions.push({ field: "presenter", question: "Who's on screen?", options: people.map((p) => ({ value: p, label: PRESENTER_LABEL[p] })) });
      style = null;
    } else {
      const styles = styleOptions(ctx, presenter);
      if (!styles.length) style = null;
      else if (styles.length === 1) style = styles[0];
      else if (!style || !styles.includes(style)) {
        style = null;
        questions.push({ field: "style", question: "Which style?", options: styles.map((s) => ({ value: s, label: STYLE_LABEL[s] })) });
      }
    }
  }
  return { questions, style };
}

/** "Wide, your Digital Twin, full video with b-roll": the real names, in the plan. */
export function videoLabel(shape: Shape, presenter: Presenter, style: VideoStyle | null): string {
  const who = presenter === "twin" ? "your Digital Twin" : presenter === "headshot" ? "your headshot avatar" : presenter === "voice_only" ? "voice only" : "yourself on camera";
  const how = style === "circle" ? "corner circle over scenes" : style === "full" ? "full video with b-roll" : null;
  return [shape === "vertical" ? "Vertical" : "Wide", who, how].filter(Boolean).join(", ");
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sparkreels.ai";

/** Opens the draft on setup with its script loaded and "You on camera" selected. */
export const recordLink = (sparkId: string) => `${SITE}/create/${sparkId}?record=1&onscreen=self`;

export const CAMERA_READY_NOTE = "Your script and Share Kit are ready. Open SparkReels to read it on the teleprompter and record yourself.";

export async function readIntent(goal: string, ctx: AgentContext): Promise<Intent> {
  const tz = ctx.timeZone ?? "America/New_York";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" }).format(new Date());
  const market = [ctx.market.city, ctx.market.state].filter(Boolean).join(", ");
  const out = await openaiChatJson(
    INTENT_SYSTEM.replace("{today}", today).replace("{tz}", tz),
    [{ role: "user", content: `Agent's market: ${market || "unknown"}\nGoal: ${goal.slice(0, 1000)}` }],
    { maxTokens: 500, label: "plan-spark-intent", timeoutMs: 30_000 },
  );
  const o = (out ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    topic: cleanTopic(str(o.topic) || goal),
    city: str(o.city) || null,
    state: /^[A-Za-z]{2}$/.test(str(o.state)) ? str(o.state).toUpperCase() : null,
    kind: o.kind === "blog_only" ? "blog_only" : "video",
    wantsBlog: o.wantsBlog === true,
    wantsSocialCopy: o.wantsSocialCopy !== false,
    isListing: o.isListing === true,
    // Never from the goal's wording: see Intent. The person's answers fill these.
    shape: null,
    presenter: null,
    style: null,
    platforms: Array.isArray(o.platforms) ? (o.platforms as unknown[]).map(String) : [],
    when: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str(o.when)) ? str(o.when) : null,
    crmFollowUp: o.crmFollowUp === true,
    clarify: str(o.clarify) || null,
  };
}

const label = (p: string) => (p === "youtube" ? "YouTube" : partnerPlatform(p)?.label ?? p);

/**
 * The place a Spark is about: the town in the goal, else the saved market
 * (the topic decides the place; the market is only a fallback). Null when
 * neither gives a full city and state.
 */
export function placeFor(intent: Pick<Intent, "city" | "state">, ctx: AgentContext): { city: string; state: string } | null {
  const m = ctx.market;
  if (intent.city) {
    const state = intent.state ?? (m.city?.toLowerCase() === intent.city.toLowerCase() ? m.state : null);
    return state ? { city: intent.city, state } : null;
  }
  return m.city && m.state ? { city: m.city, state: m.state } : null;
}

/**
 * Whether a script can be written with no place. The script writer allows it
 * only for the owner's admin account and SparkReels mode, so a plan for
 * anyone else must have a town before it can be approved.
 */
export const needsPlace = (ctx: AgentContext) => !ctx.allowance.isRealAdmin && !ctx.allowance.sparkreelsMode;

/** Builds the steps from the intent and what this account can actually run. */
export function buildPlan(intent: Intent, ctx: AgentContext) {
  const steps: PlanStep[] = [];
  const upgrade: string[] = [];
  const notes: string[] = [];
  const left = videosLeft(ctx);
  const canVideo = left === "unlimited" || left > 0;
  const shape: Shape = intent.shape ?? "wide";
  const presenter: Presenter = intent.presenter ?? "voice_only";
  // Recording yourself happens in SparkReels and never uses a plan video.
  const camera = intent.kind === "video" && presenter === "camera";
  const makeVideo = intent.kind === "video" && !camera && canVideo;
  if (intent.kind === "video" && !camera && !canVideo) {
    upgrade.push("You have no videos left this month. Buy extra videos in Billing, or upgrade for more each month. Recording yourself on camera never uses one.");
  }
  if (camera) {
    notes.push("Recording happens in SparkReels: when the script and Share Kit are ready, you'll get a link to the teleprompter. Once it's recorded, you can come back here to post it.");
  }

  let n = 1;
  steps.push({
    n: n++, tool: "write_script", title: `Write the script: "${shortTopic(intent.topic)}"`, usesVideo: false, needsConfirm: false,
    input: {
      videoType: "custom",
      customTopic: intent.topic,
      city: placeFor(intent, ctx)?.city ?? "",
      state: placeFor(intent, ctx)?.state ?? "",
      shortScript: intent.kind === "video" && shape === "vertical",
      videoPlatform: shape === "vertical" ? "reel" : "youtube",
      blogOnly: intent.kind === "blog_only",
      ...(camera && { camera: true }),
    },
  });
  const scriptStep = 1;
  if (makeVideo) {
    steps.push({
      n: n++, tool: "make_video",
      title: `Make the video: ${videoLabel(shape, presenter, intent.style)}`,
      usesVideo: true, needsConfirm: false,
      input: { sparkFromStep: scriptStep, size: shape, voiceOnly: presenter === "voice_only", presenter, style: intent.style },
    });
  }
  if (intent.wantsBlog || intent.kind === "blog_only") {
    steps.push({ n: n++, tool: "make_blog", title: "Write the blog post", usesVideo: false, needsConfirm: false, input: { sparkFromStep: scriptStep } });
  }
  // A camera plan always gets its Share Kit: it's most of what the AI can do for it.
  if (camera || (makeVideo && intent.wantsSocialCopy)) {
    steps.push({
      n: n++, tool: "make_social_copy", title: "Write the Share Kit (LinkedIn, Facebook, Instagram, YouTube)", usesVideo: false, needsConfirm: false,
      input: { sparkFromStep: scriptStep, ...(camera && { camera: true }) },
    });
  }
  if (camera) {
    steps.push({
      n: n++, tool: "record_in_sparkreels", title: `Record it yourself in SparkReels: ${shape === "vertical" ? "Vertical" : "Wide"}, on the teleprompter (link when ready)`,
      usesVideo: false, needsConfirm: false, manual: true, input: { sparkFromStep: scriptStep },
    });
  }

  // Where to post: what they asked for, limited to what's connected.
  const asked = intent.platforms.length ? intent.platforms : ctx.connected;
  const postable = asked.filter((p) => ctx.connected.includes(p));
  const missing = intent.platforms.filter((p) => !ctx.connected.includes(p));
  if (missing.length) notes.push(`Not connected yet: ${missing.map(label).join(", ")}. Connect them in Settings to post there.`);
  if (makeVideo && postable.length) {
    const tz = ctx.timeZone;
    const whenUtc = intent.when && tz ? zonedToUtc(intent.when.slice(0, 10), intent.when.slice(11), tz).toISOString() : null;
    steps.push({
      n: n++, tool: intent.when ? "schedule_video" : "publish_video",
      title: intent.when
        ? `Schedule to ${postable.map(label).join(", ")}${whenUtc && tz ? `, ${formatWhen(new Date(whenUtc), tz)}` : ""} (you confirm when the video is ready)`
        : `Post to ${postable.map(label).join(", ")} (you confirm when the video is ready)`,
      usesVideo: false, needsConfirm: true,
      input: { videoFromStep: 2, platforms: postable, ...(intent.when && { when: intent.when }) },
    });
    if (intent.when && !tz) notes.push("Your time zone isn't set, so you'll be asked for it before scheduling.");
  }
  if (intent.crmFollowUp) {
    steps.push({ n: n++, tool: "send_followup", title: "Follow up with your contacts (coming soon)", usesVideo: false, needsConfirm: true, comingSoon: true, input: {} });
  }

  const videosNeeded = steps.filter((s) => s.usesVideo).length;
  const totals = {
    videosNeeded,
    videosLeft: left,
    platforms: postable,
    notConnected: missing,
    features: Array.from(new Set(steps.filter((s) => !s.comingSoon && !s.manual).map((s) => s.tool))),
    // Kept so editing a plan doesn't ask these again.
    choices: { shape, presenter, style: intent.style },
  };
  return { steps, totals, upgrade, notes };
}

/** Plain-language summary a client can show with Approve / Edit / Cancel. */
export function summarize(steps: PlanStep[], totals: { videosNeeded: number; videosLeft: number | "unlimited" }, notes: string[], upgrade: string[]): string {
  const lines = ["Recommended Spark Plan:", ...steps.map((s) => `${s.n}. ${s.title}`)];
  lines.push(totals.videosNeeded
    ? `Uses ${totals.videosNeeded} of your ${totals.videosLeft === "unlimited" ? "unlimited" : totals.videosLeft} videos left.`
    : "Uses none of your videos.");
  lines.push("No script, video or post is created until you approve. Posting always needs its own confirmation.");
  if (notes.length) lines.push(...notes);
  if (upgrade.length) lines.push(`Upgrade opportunity: ${upgrade.join(" ")}`);
  lines.push("Approve Plan · Edit Plan · Cancel");
  return lines.join("\n");
}

/** Stores a plan (status proposed) and returns it. */
export async function savePlan(
  actor: AgentActor,
  p: { goal: string; steps: PlanStep[]; totals: Record<string, unknown>; summary: string; upgrade: string[]; version?: number },
): Promise<string> {
  const { data, error } = await createAdminClient()
    .from("agent_plans")
    .insert({
      user_id: actor.userId,
      source: actor.source,
      adapter: actor.adapter,
      connection_id: actor.connectionId,
      goal: p.goal.slice(0, 2000),
      steps: p.steps,
      totals: p.totals,
      summary: p.summary,
      upgrade: p.upgrade,
      version: p.version ?? 1,
      plan_hash: planHash(p.steps, p.totals),
      status: "proposed",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't save the plan.");
  return (data as { id: string }).id;
}
