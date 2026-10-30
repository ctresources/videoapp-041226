import type { createAdminClient } from "@/lib/supabase/admin";
import { addDays, dayKey, weekdayOf, zonedToUtc } from "@/lib/utils/time-zone";
import { mondayFor, zoneOf } from "@/lib/autopilot";
import {
  HALO_PLATFORMS, buildThumbnail, callWriter, sanitizeSettings, setupFor,
  type HaloProfile, type HaloSetup,
} from "@/lib/halo";
import { makeDraftVideo } from "@/lib/halo/make";
import { addSparkleeNote } from "@/lib/sparklee-notes";

type Admin = ReturnType<typeof createAdminClient>;

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * The day it posts, from the words: "today", "tomorrow", a weekday ("Friday",
 * "this Friday", "next Friday"). Otherwise tomorrow. Always at their Halo
 * time, in their own time zone. Never in the past.
 */
export function sparkleeSlot(words: string, tz: string, time: string, now = new Date()): Date {
  const t = words.toLowerCase();
  const today = dayKey(now, tz);
  let day = addDays(today, 1);
  if (/\btoday\b|\btonight\b/.test(t)) day = today;
  else if (/\btomorrow\b/.test(t)) day = addDays(today, 1);
  else {
    const hit = DAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
    if (hit >= 0) {
      const from = weekdayOf(today);
      let ahead = (hit - from + 7) % 7;
      if (ahead === 0) ahead = 7;
      if (/\bnext\s+\w*day\b/.test(t) && ahead < 7) ahead += 7;
      day = addDays(today, ahead);
    }
  }
  let slot = zonedToUtc(day, time, tz);
  if (slot.getTime() < now.getTime() + 30 * 60 * 1000) slot = zonedToUtc(addDays(day, 1), time, tz);
  return slot;
}

export interface SparkleeAsk {
  /** Everything that was said, for the day it posts. */
  words: string;
  topic: string;
  city: string;
  state: string;
  size?: "vertical" | "horizontal" | null;
  look?: "circle" | "full" | null;
  /** A particular look (the Digital Twin), when one was asked for. */
  lookId?: string | null;
  audience?: string | null;
  tone?: string | null;
}

/**
 * "Tell Sparklee what to make" (2026-10-26, usability sweep #11).
 *
 * A draft like a Halo one, from a spoken request: the script, blog, title and
 * thumbnail are written, then the video is made straight away. Nothing posts
 * until the agent watches it and presses Approve to post. Posted to the
 * accounts used last time, on the day they said (or tomorrow).
 *
 * Returns the draft id and the work to finish in the background.
 */
export async function startSparkleeDraft(
  admin: Admin,
  user: { id: string; email: string | null },
  profile: HaloProfile,
  ask: SparkleeAsk,
  /**
   * From an approved Home plan (2026-10-29): the accounts the plan named, and
   * no video yet. The draft is written and waits; the agent presses Make
   * video, then Approve. Nothing is charged until then.
   */
  opts: { makeVideo?: boolean; platforms?: string[] } = {},
): Promise<{ draftId: string; slotAt: string; platforms: string[]; work: Promise<void> } | null> {
  const s = sanitizeSettings(profile.halo_settings);
  const tz = zoneOf(profile);

  // The accounts from the last draft they set up, else their Halo defaults.
  const { data: last } = await admin
    .from("autopilot_drafts")
    .select("setup")
    .eq("user_id", user.id)
    .in("source", ["sparklee", "halo", "email"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastPlatforms = ((last as { setup: HaloSetup } | null)?.setup?.platforms ?? [])
    .filter((p) => HALO_PLATFORMS.includes(p));

  const base = setupFor(s, "other");
  const setup: HaloSetup = {
    ...base,
    look: ask.look ?? base.look,
    lookId: ask.lookId ?? base.lookId,
    size: ask.size ?? base.size,
    platforms: opts.platforms?.length
      ? opts.platforms.filter((p) => HALO_PLATFORMS.includes(p))
      : lastPlatforms.length ? lastPlatforms : base.platforms,
  };
  const slot = sparkleeSlot(ask.words, tz, s.time);

  const { data: row, error } = await admin
    .from("autopilot_drafts")
    .insert({
      user_id: user.id,
      week_of: mondayFor(slot, tz),
      slot_at: slot.toISOString(),
      kind: "video",
      topic: ask.topic.slice(0, 300),
      source: "sparklee",
      source_kind: "request",
      setup,
      status: "writing",
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error("[sparklee] draft insert:", error?.message);
    return null;
  }
  const draftId = (row as { id: string }).id;

  const work = (async () => {
    try {
      const vertical = setup.size === "vertical";
      const now = new Date();
      const projectId = await callWriter(user.id, {
        videoType: "custom",
        customTopic: ask.topic,
        city: ask.city,
        state: ask.state,
        month: now.toLocaleString("en-US", { month: "long", timeZone: tz }),
        year: now.getFullYear(),
        ...(ask.audience && { audience: ask.audience }),
        ...(ask.tone && { tone: ask.tone }),
        videoLength: "standard",
        shortScript: vertical,
        videoPlatform: vertical ? "reel" : "youtube",
        renderMode: "avatar_voice",
        ...(setup.look === "circle" && { avatarStyle: "circle" }),
      });
      // Still "writing" until the video has started, so the card never offers
      // Make video while this is already making one (no second charge).
      await admin.from("autopilot_drafts").update({ project_id: projectId }).eq("id", draftId);
      await buildThumbnail(admin, user.id, projectId, null);
      if (opts.makeVideo === false) {
        await admin.from("autopilot_drafts").update({ status: "draft", post_error: null }).eq("id", draftId);
        return;
      }
      // Made straight away: that is what was asked for.
      const made = await makeDraftVideo(admin, user, { id: draftId, setup, project_id: projectId });
      const why = made.status >= 400
        ? (typeof made.out.error === "string" ? made.out.error : "Couldn't start the video.")
        : null;
      await admin.from("autopilot_drafts").update({ status: "draft", post_error: why }).eq("id", draftId);
      if (why) {
        await addSparkleeNote(admin, {
          userId: user.id, kind: "needs",
          title: `I wrote "${ask.topic.slice(0, 80)}" but couldn't start the video.`,
          body: why,
          actionLabel: "Open AutoSparks", actionHref: "/autosparks",
          projectId, dedupeKey: `sparklee-make-${draftId}`,
        });
      }
    } catch (err) {
      console.error(`[sparklee] draft ${draftId} failed:`, err instanceof Error ? err.message : err);
      await admin.from("autopilot_drafts").update({ status: "failed" }).eq("id", draftId);
    }
  })();

  return { draftId, slotAt: slot.toISOString(), platforms: setup.platforms, work };
}
