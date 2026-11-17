import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel } from "@/lib/access";
import { geminiKey } from "@/lib/api/gemini";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { closingLineWords, shortScriptBudget } from "@/lib/utils/script-budget";
import { noteProbe } from "@/lib/security/probe";
import {
  MONTHLY_READS, readVideoStyle, writeLikeScript, youtubeWatchUrl, type LikeStyle,
} from "@/lib/video/like-video";

/**
 * Make one like this (2026-11-16).
 *
 *   GET                                   { left, limit }
 *   POST { action: "read", path | youtube, topic, city?, state?, for? }
 *        → { style, picks, script, title, left }
 *   POST { action: "write", style, topic, city?, state?, for? } → { script, title }
 *
 * `path` is the agent's upload in assets/<user id>/like-video/, sent there
 * straight from the browser (so the 4.5 MB request limit doesn't apply), and
 * deleted from storage and from Gemini once read. Only the style notes are
 * kept. Every plan, 20 reads a month; admins aren't limited. "Write it again"
 * is not a read.
 */

export const maxDuration = 300;

const MAX_BYTES = 200 * 1024 * 1024;

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  return { user, supabase, admin, unlimited: getAccessLevel(prof as never) === "admin" };
}

async function readsLeft(s: NonNullable<Awaited<ReturnType<typeof session>>>): Promise<number | null> {
  if (s.unlimited) return null;
  const { count } = await s.admin.from("like_video_reads").select("id", { count: "exact", head: true })
    .eq("user_id", s.user.id).gte("created_at", monthStart());
  return Math.max(0, MONTHLY_READS - (count ?? 0));
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ left: await readsLeft(s), limit: s.unlimited ? null : MONTHLY_READS });
}

export async function POST(req: NextRequest) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = await freeTrialGateResponse(s.user.id, { preVideo: "toward-video" });
  if (gate) return gate;
  if (!geminiKey()) return NextResponse.json({ error: "This isn't available right now." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const topic = text(b.topic, 500);
  const city = text(b.city, 80) || undefined;
  const state = text(b.state, 20) || undefined;
  const camera = b.for === "camera";
  const brief = { audience: text(b.audience, 80) || undefined, tone: text(b.tone, 80) || undefined, purpose: text(b.purpose, 80) || undefined };
  if (!topic) return NextResponse.json({ error: "Say or type your topic first." }, { status: 400 });
  noteProbe({ text: topic, source: "like-video-topic", userId: s.user.id, req });

  // The longest the script may be: a rendered video leaves room for the
  // agent's closing line inside the 2-minute cap; a camera take can run 3 min.
  const maxWords = camera ? 450 : shortScriptBudget(await closingLineWords(s.supabase, s.user.id, { city, state })).target;

  if (b.action === "write") {
    const style = b.style as LikeStyle | undefined;
    if (!style || typeof style !== "object" || typeof style.seconds !== "number") {
      return NextResponse.json({ error: "Read a video first." }, { status: 400 });
    }
    const out = await writeLikeScript({ style, topic, city, state, maxWords, ...brief });
    if (!out) return NextResponse.json({ error: "The script didn't come back. Try again." }, { status: 502 });
    return NextResponse.json(out);
  }

  if (b.action !== "read") return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const left = await readsLeft(s);
  if (left !== null && left <= 0) {
    return NextResponse.json({ error: `You've used your ${MONTHLY_READS} video reads this month.` }, { status: 429 });
  }

  const path = text(b.path, 300);
  const youtube = b.youtube ? youtubeWatchUrl(String(b.youtube)) : null;
  if (!path && !youtube) {
    return NextResponse.json({ error: b.youtube ? "That isn't a YouTube link." : "Add a video first." }, { status: 400 });
  }
  if (path && (!path.startsWith(`${s.user.id}/like-video/`) || path.includes(".."))) {
    return NextResponse.json({ error: "Add the video again." }, { status: 400 });
  }

  let read: Awaited<ReturnType<typeof readVideoStyle>> = null;
  try {
    if (path) {
      const { data: blob, error } = await s.admin.storage.from("assets").download(path);
      if (error || !blob) return NextResponse.json({ error: "Add the video again." }, { status: 400 });
      if (blob.size > MAX_BYTES) return NextResponse.json({ error: "That video is over 200 MB." }, { status: 400 });
      const buf = Buffer.from(await blob.arrayBuffer());
      const mime = blob.type?.startsWith("video/") ? blob.type
        : /\.webm$/i.test(path) ? "video/webm" : /\.mov$/i.test(path) ? "video/quicktime" : "video/mp4";
      read = await readVideoStyle({ buf, mime });
    } else if (youtube) {
      read = await readVideoStyle({ youtube });
    }
  } finally {
    // The agent's copy of someone else's video is never kept.
    if (path) void s.admin.storage.from("assets").remove([path]).catch(() => null);
  }

  if (!read) {
    return NextResponse.json({
      error: youtube ? "Couldn't watch that video. It may be private; try uploading it instead." : "Couldn't watch that video. Try another one.",
    }, { status: 502 });
  }

  await s.admin.from("like_video_reads").insert({
    user_id: s.user.id, source: path ? "upload" : "youtube", style: read.style,
  });

  const written = await writeLikeScript({ style: read.style, topic, city, state, maxWords, ...brief });
  return NextResponse.json({
    style: read.style,
    picks: read.picks,
    script: written?.script ?? "",
    title: written?.title ?? "",
    left: left === null ? null : left - 1,
  });
}
