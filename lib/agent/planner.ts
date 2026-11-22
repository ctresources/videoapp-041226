import { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";
import { partnerPlatform } from "@/lib/utils/social-platforms";
import { formatWhen, zonedToUtc } from "@/lib/utils/time-zone";
import { type AgentContext, videosLeft } from "@/lib/agent/context";
import { planHash, type PlanStep } from "@/lib/agent/approvals";
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

export interface Intent {
  topic: string;
  kind: "video" | "blog_only";
  wantsBlog: boolean;
  wantsSocialCopy: boolean;
  shape: "vertical" | "wide";
  presenter: "avatar" | "voice_only";
  platforms: string[];
  /** Local wall time, "YYYY-MM-DDTHH:mm", when the goal names one. */
  when: string | null;
  crmFollowUp: boolean;
  clarify: string | null;
}

const INTENT_SYSTEM = `You read a real estate agent's goal and return what content they want. You do not write the content.
Return ONLY JSON: {"topic": "...", "kind": "video" | "blog_only", "wantsBlog": bool, "wantsSocialCopy": bool, "shape": "vertical" | "wide", "presenter": "avatar" | "voice_only", "platforms": ["youtube","instagram","facebook","linkedin","tiktok","x","threads","google_business"], "when": "YYYY-MM-DDTHH:mm" | null, "crmFollowUp": bool, "clarify": "one short question" | null}
- topic: a specific video topic in plain words, including the town if given. For "market my listing", the listing's address or description if given.
- Default kind "video", shape "vertical" unless YouTube-only or "landscape", presenter "avatar".
- wantsSocialCopy true unless they say otherwise. wantsBlog true for market updates, guides and listings.
- platforms: only ones they named; [] means "where they're connected".
- when: only if they named a day or time. Today is {today} in {tz}.
- crmFollowUp: true if they mention their database, past clients, contacts, BoldTrail, GHL or follow-up.
- clarify: only if the goal is too vague to pick a topic.
${FAIR_HOUSING_SHORT}`;

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
    topic: str(o.topic) || goal.slice(0, 200),
    kind: o.kind === "blog_only" ? "blog_only" : "video",
    wantsBlog: o.wantsBlog === true,
    wantsSocialCopy: o.wantsSocialCopy !== false,
    shape: o.shape === "wide" ? "wide" : "vertical",
    presenter: o.presenter === "voice_only" ? "voice_only" : "avatar",
    platforms: Array.isArray(o.platforms) ? (o.platforms as unknown[]).map(String) : [],
    when: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str(o.when)) ? str(o.when) : null,
    crmFollowUp: o.crmFollowUp === true,
    clarify: str(o.clarify) || null,
  };
}

const label = (p: string) => (p === "youtube" ? "YouTube" : partnerPlatform(p)?.label ?? p);

/** Builds the steps from the intent and what this account can actually run. */
export function buildPlan(intent: Intent, ctx: AgentContext) {
  const steps: PlanStep[] = [];
  const upgrade: string[] = [];
  const notes: string[] = [];
  const left = videosLeft(ctx);
  const canVideo = left === "unlimited" || left > 0;
  const makeVideo = intent.kind === "video" && canVideo;
  if (intent.kind === "video" && !canVideo) {
    upgrade.push("You have no videos left this month. Buy extra videos in Billing, or upgrade for more each month.");
  }
  if (makeVideo && intent.presenter === "avatar" && !ctx.ready.photoAvatar && !ctx.ready.twin) {
    notes.push("No avatar is set up yet, so the video is voice only. Add a headshot in Settings to appear on camera.");
  }
  const presenter = makeVideo && intent.presenter === "avatar" && !ctx.ready.photoAvatar && !ctx.ready.twin ? "voice_only" : intent.presenter;

  let n = 1;
  steps.push({
    n: n++, tool: "write_script", title: `Write the script: "${intent.topic}"`, usesVideo: false, needsConfirm: false,
    input: {
      videoType: "custom",
      customTopic: intent.topic,
      city: ctx.market.city ?? "",
      state: ctx.market.state ?? "",
      shortScript: intent.shape === "vertical",
      videoPlatform: intent.shape === "vertical" ? "reel" : "youtube",
      blogOnly: !makeVideo && intent.kind === "blog_only",
    },
  });
  const scriptStep = 1;
  if (makeVideo) {
    steps.push({
      n: n++, tool: "make_video",
      title: `Make the video: ${intent.shape === "vertical" ? "vertical" : "wide"}, ${presenter === "voice_only" ? "voice only" : "you on camera"}`,
      usesVideo: true, needsConfirm: false,
      input: { sparkFromStep: scriptStep, size: intent.shape, voiceOnly: presenter === "voice_only" },
    });
  }
  if (intent.wantsBlog || intent.kind === "blog_only") {
    steps.push({ n: n++, tool: "make_blog", title: "Write the blog post", usesVideo: false, needsConfirm: false, input: { sparkFromStep: scriptStep } });
  }
  if (makeVideo && intent.wantsSocialCopy) {
    steps.push({ n: n++, tool: "make_social_copy", title: "Write the social copy (LinkedIn, Facebook, Instagram, YouTube)", usesVideo: false, needsConfirm: false, input: { sparkFromStep: scriptStep } });
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
    features: Array.from(new Set(steps.filter((s) => !s.comingSoon).map((s) => s.tool))),
  };
  return { steps, totals, upgrade, notes };
}

/** Plain-language summary a client can show with Approve / Edit / Cancel. */
export function summarize(steps: PlanStep[], totals: { videosNeeded: number; videosLeft: number | "unlimited" }, notes: string[], upgrade: string[]): string {
  const lines = ["Recommended Spark Plan:", ...steps.map((s) => `${s.n}. ${s.title}`)];
  lines.push(totals.videosNeeded
    ? `Uses ${totals.videosNeeded} of your ${totals.videosLeft === "unlimited" ? "unlimited" : totals.videosLeft} videos left.`
    : "Uses none of your videos.");
  lines.push("Nothing is created until you approve. Posting always needs its own confirmation.");
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
