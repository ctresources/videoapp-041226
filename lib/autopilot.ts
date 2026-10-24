import { hasAdminPerks } from "@/lib/utils/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { perplexityChat } from "@/lib/api/perplexity";
import { PAID_TIERS } from "@/lib/utils/plan-features";
import { DEFAULT_TIME_ZONE, addDays, dayKey, isValidTimeZone, weekdayOf, zonedToUtc } from "@/lib/utils/time-zone";

/**
 * Weekly Autopilot, step 1 (2026-10-21, the owner's plan: 3 a week, all paid
 * plans, a Monday email). SparkReels picks the week's topics and writes each
 * one as an ordinary project (script, blog, title and description) through
 * the same writer the Create page uses. Nothing is rendered, posted or charged:
 * the agent approves, changes or skips each draft on /autopilot.
 */

export const AUTOPILOT_PER_WEEK = 3;
/** Ideas an agent may ask for in a week, on top of the Sunday three. */
export const AUTOPILOT_ASKS_PER_WEEK = 6;
/**
 * The days and time the week's drafts are set for, in the agent's own time
 * zone: their choice since 2026-10-21 (profiles.autopilot_days, 0 = Sunday …
 * 6 = Saturday, and autopilot_time), Tuesday, Thursday, Saturday at 9 to start.
 */
const DEFAULT_DAYS = [2, 4, 6];
const DEFAULT_TIME = "09:00";

function daysOf(p: Pick<AutopilotProfile, "autopilot_days">): number[] {
  const days = (p.autopilot_days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? Array.from(new Set(days)) : DEFAULT_DAYS;
}
function timeOf(p: Pick<AutopilotProfile, "autopilot_time">): string {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(p.autopilot_time ?? "") ? p.autopilot_time! : DEFAULT_TIME;
}

type Admin = ReturnType<typeof createAdminClient>;

export interface AutopilotProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  subscription_tier: string | null;
  location_city: string | null;
  location_state: string | null;
  time_zone: string | null;
  autopilot_enabled: boolean | null;
  /** How many of the week's 3 are videos; the rest are blog posts (0–3). */
  autopilot_videos: number | null;
  /** The days the drafts are set for, 0 = Sunday … 6 = Saturday. */
  autopilot_days: number[] | null;
  /** The time they are set for, "HH:MM". */
  autopilot_time: string | null;
}

export const AUTOPILOT_PROFILE_SELECT =
  "id, email, full_name, role, subscription_tier, location_city, location_state, time_zone, autopilot_enabled, autopilot_videos, autopilot_days, autopilot_time";

/** Paid plans and admins. */
export function autopilotEligible(p: Pick<AutopilotProfile, "role" | "subscription_tier">): boolean {
  return hasAdminPerks(p.role) || PAID_TIERS.includes(p.subscription_tier ?? "free");
}

export function zoneOf(p: Pick<AutopilotProfile, "time_zone">): string {
  return isValidTimeZone(p.time_zone) ? p.time_zone : DEFAULT_TIME_ZONE;
}

/** The Monday of the week a draft belongs to: this week's, or next week's on a Sunday. */
export function mondayFor(now: Date, tz: string): string {
  const today = dayKey(now, tz);
  const wd = weekdayOf(today);
  return wd === 0 ? addDays(today, 1) : addDays(today, 1 - wd);
}

/** The week's slots on the agent's days, Monday first and Sunday last. */
export function weekSlots(monday: string, tz: string, days: number[] = DEFAULT_DAYS, time = DEFAULT_TIME): Date[] {
  return days
    .map((d) => (d + 6) % 7) // Monday = 0 … Sunday = 6, counted from the week's Monday
    .sort((a, b) => a - b)
    .map((offset) => zonedToUtc(addDays(monday, offset), time, tz));
}

interface TopicIdea { topic: string; reason: string; kind: "video" | "blog" }

/**
 * The topics, from the market, the season, what buyers ask AI, and anything
 * the agent asked for. Never repeats a recent title.
 */
async function pickTopics(opts: {
  city: string; state: string; monthName: string; year: number;
  recent: string[]; request?: string; count: number;
  /** How many are videos; the rest are blog posts. */
  videos: number;
}): Promise<TopicIdea[]> {
  const place = opts.city && opts.state ? `${opts.city}, ${opts.state}` : "the agent's area";
  const ask = opts.request?.trim()
    ? `The agent asked for: "${opts.request.trim().slice(0, 300)}". Every idea must follow that request.`
    : `Mix them: one about the local market right now, one seasonal for ${opts.monthName}, one answering a question buyers or sellers in ${place} ask AI assistants.`;
  const content = await perplexityChat([
    {
      role: "system",
      content:
        "You plan a real estate agent's short videos and blog posts. Reply with ONLY a JSON array, no prose. " +
        'Each item: {"topic": a specific video topic in under 14 words, "reason": why it fits now in under 10 words, ' +
        '"kind": "video" or "blog"}. Topics are concrete and local, never generic, and never name a specific property.',
    },
    {
      role: "user",
      content:
        `Agent's market: ${place}. Today: ${opts.monthName} ${opts.year}. Give ${opts.count} ideas. ${ask} ` +
        `Make the first ${opts.videos} "video" and the other ${opts.count - opts.videos} "blog". ` +
        (opts.recent.length ? `Do not repeat these recent topics: ${opts.recent.slice(0, 15).join(" | ")}.` : ""),
    },
  ]);
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("No topics came back.");
  const parsed = JSON.parse(match[0]) as Partial<TopicIdea>[];
  return parsed
    .filter((i) => typeof i.topic === "string" && i.topic.trim())
    .slice(0, opts.count)
    // The agent's mix decides the kind, whatever the model said: the first
    // ones are videos, the rest blog posts (2026-10-21).
    .map((i, n) => ({
      topic: i.topic!.trim().slice(0, 200),
      reason: (i.reason ?? "").trim().slice(0, 120),
      kind: n < opts.videos ? "video" : "blog",
    }));
}

/** Where the writer route lives; the production site unless told otherwise. */
function baseUrl(): string {
  return (process.env.AUTOPILOT_BASE_URL || "https://www.sparkreels.ai").replace(/\/$/, "");
}

/** One draft written through the Create page's own writer, as the agent. */
async function writeDraft(admin: Admin, draftId: string, userId: string, idea: TopicIdea, city: string, state: string, now: Date) {
  try {
    const res = await fetch(`${baseUrl()}/api/ai/generate-location-script`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
        "x-autopilot-user": userId,
      },
      body: JSON.stringify({
        videoType: "custom",
        customTopic: idea.topic,
        city, state,
        month: now.toLocaleString("en-US", { month: "long" }),
        year: now.getFullYear(),
        videoLength: "standard",
        // A video draft renders in the circle (Avatar III, the cheap one) unless
        // the agent changes it; a blog draft is the article alone.
        ...(idea.kind === "video" ? { avatarStyle: "circle" } : { blogOnly: true }),
      }),
    });
    const body = await res.json().catch(() => ({}));
    const projectId = (body as { project?: { id?: string } }).project?.id;
    if (!res.ok || !projectId) throw new Error((body as { error?: string }).error || `Writer ${res.status}`);
    await admin.from("autopilot_drafts").update({ project_id: projectId, status: "draft" }).eq("id", draftId);
  } catch (err) {
    console.error(`[autopilot] draft ${draftId} failed:`, err instanceof Error ? err.message : err);
    await admin.from("autopilot_drafts").update({ status: "failed" }).eq("id", draftId);
  }
}

/**
 * Picks the topics and starts the drafts. Returns once the rows exist (marked
 * "writing"); `written` resolves when every draft has been written or failed,
 * for callers that run it in the background.
 */
export async function startDrafts(
  admin: Admin,
  profile: AutopilotProfile,
  opts: { request?: string; count?: number; now?: Date } = {},
): Promise<{ ids: string[]; written: Promise<void> }> {
  const now = opts.now ?? new Date();
  const tz = zoneOf(profile);
  const monday = mondayFor(now, tz);
  const city = profile.location_city?.trim() ?? "";
  const state = profile.location_state?.trim() ?? "";

  const { data: recentRows } = await admin
    .from("projects")
    .select("title")
    .eq("user_id", profile.id)
    .gte("created_at", new Date(now.getTime() - 45 * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(20);
  const recent = ((recentRows ?? []) as { title: string | null }[]).map((r) => r.title ?? "").filter(Boolean);

  const count = opts.count ?? AUTOPILOT_PER_WEEK;
  // The agent's weekly mix (1 video + 2 blogs unless they chose otherwise,
  // since 2026-10-24: every plan has 4 short videos a month), scaled to
  // however many are being written.
  const weekly = Math.max(0, Math.min(AUTOPILOT_PER_WEEK, profile.autopilot_videos ?? 1));
  // An ask that says "blog" or "video" gets that, whatever the weekly mix.
  const asked = opts.request ?? "";
  const videos = /\bblogs?\b|\barticles?\b/i.test(asked) && !/\bvideos?\b|\breels?\b/i.test(asked)
    ? 0
    : /\bvideos?\b|\breels?\b/i.test(asked) && !/\bblogs?\b|\barticles?\b/i.test(asked)
      ? count
      : Math.round((weekly / AUTOPILOT_PER_WEEK) * count);
  const ideas = await pickTopics({
    videos,
    city, state,
    monthName: now.toLocaleString("en-US", { month: "long", timeZone: tz }),
    year: now.getFullYear(),
    recent, request: opts.request, count,
  });
  if (!ideas.length) return { ids: [], written: Promise.resolve() };

  // The Sunday three take Tuesday, Thursday and Saturday. Asked-for ideas take
  // the next mornings from tomorrow, so they land in the days ahead.
  const slots = opts.request
    ? ideas.map((_, i) => zonedToUtc(addDays(dayKey(now, tz), i + 1), timeOf(profile), tz))
    : weekSlots(monday, tz, daysOf(profile), timeOf(profile));

  const { data: rows, error } = await admin
    .from("autopilot_drafts")
    .insert(ideas.map((idea, i) => ({
      user_id: profile.id,
      week_of: monday,
      slot_at: (slots[i] ?? slots[slots.length - 1]).toISOString(),
      kind: idea.kind,
      topic: idea.topic,
      reason: idea.reason || null,
      requested: !!opts.request,
      status: "writing",
    })))
    .select("id");
  if (error || !rows) throw new Error(error?.message || "Couldn't save the drafts.");
  const ids = (rows as { id: string }[]).map((r) => r.id);

  const written = Promise.allSettled(
    ideas.map((idea, i) => writeDraft(admin, ids[i], profile.id, idea, city, state, now)),
  ).then(() => undefined);
  return { ids, written };
}
