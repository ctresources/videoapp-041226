import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SocialPublishError, profileUsername, publishPhotos, uploadPostConfigured,
  type PhotoFile, type PublishAccepted,
} from "@/lib/api/upload-post";
import { storeRef } from "@/lib/api/social-settle";
import {
  INSTAGRAM_MAX_PHOTOS, PHOTO_PLATFORMS, fitCaption, partnerPlatformLimit, platformFromAccountId,
  type PartnerPlatform,
} from "@/lib/utils/social-platforms";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST /api/social/post-photos — photos as one post, swipeable where there is
 * more than one.
 *
 * The other thing a set of listing photos can be. A photo reel turns them into
 * a video; this sends the stills themselves. Nothing is rendered and nothing
 * comes out of the plan.
 *
 * Every photo is fetched here and re-encoded before it goes anywhere, rather
 * than handing the platforms our addresses:
 *   - the form takes WEBP and a listing import can bring AVIF, and Instagram
 *     takes neither;
 *   - a phone photo is often 4000px wide and Instagram stops at 1440;
 *   - a listing site's image address may not open for anyone but a browser on
 *     its own page.
 * One JPEG, 1440 at most on its long side, upright, is something all of them
 * accept.
 */
const MAX_PHOTOS = 12;
const MAX_BYTES = 20 * 1024 * 1024;
const FETCH_MS = 10_000;

/** Instagram refuses anything taller than 4:5 or wider than 1.91:1. */
const IG_MIN_RATIO = 4 / 5;
const IG_MAX_RATIO = 1.91;

/**
 * Only somewhere on the public web. The photos' addresses come from the
 * browser, and this server fetches them, so an address pointing back inside
 * (a local name, a bare IP) is refused rather than fetched.
 */
function publicImageUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return null;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null;
  return url;
}

async function fetchPhoto(url: URL): Promise<Buffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_MS),
    redirect: "follow",
    // Some listing CDNs refuse a request with no referer from their own site.
    headers: { referer: url.origin },
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) throw new Error("empty or too large");
  return buf;
}

/** Upright, 1440 at most on the long side, JPEG. */
async function normalise(buf: Buffer): Promise<{ bytes: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize({ width: 1440, height: 1440, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** The same photo trimmed, from the middle, to a shape Instagram accepts. */
async function forInstagram(p: { bytes: Buffer; width: number; height: number }): Promise<Buffer> {
  const ratio = p.width / p.height;
  if (ratio >= IG_MIN_RATIO && ratio <= IG_MAX_RATIO) return p.bytes;
  const width = ratio > IG_MAX_RATIO ? Math.round(p.height * IG_MAX_RATIO) : p.width;
  const height = ratio < IG_MIN_RATIO ? Math.round(p.width / IG_MIN_RATIO) : p.height;
  return sharp(p.bytes)
    .extract({ left: Math.round((p.width - width) / 2), top: Math.round((p.height - height) / 2), width, height })
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    photos?: unknown; caption?: unknown; accountIds?: unknown; aiMade?: unknown;
  };
  const urls = (Array.isArray(body.photos) ? body.photos : [])
    .filter((u): u is string => typeof u === "string")
    .slice(0, MAX_PHOTOS)
    .map(publicImageUrl);
  if (urls.length === 0) return NextResponse.json({ error: "Add at least one photo." }, { status: 400 });
  if (urls.some((u) => !u)) return NextResponse.json({ error: "One of those photos can't be posted from here." }, { status: 400 });

  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  if (!caption) return NextResponse.json({ error: "Write a caption first." }, { status: 400 });

  const platforms = Array.from(new Set(
    (Array.isArray(body.accountIds) ? body.accountIds : [])
      .map((id) => (typeof id === "string" ? platformFromAccountId(id) : null))
      .filter((p): p is PartnerPlatform => !!p && PHOTO_PLATFORMS.includes(p)),
  ));
  if (platforms.length === 0) return NextResponse.json({ error: "Choose where to post." }, { status: 400 });

  const admin = createAdminClient();
  const { data: ownerRow } = await admin
    .from("profiles")
    .select("subscription_tier, role, social_profile_created_at")
    .eq("id", user.id)
    .maybeSingle();
  const owner = ownerRow as { subscription_tier: string | null; role: string | null; social_profile_created_at: string | null } | null;
  const limit = partnerPlatformLimit(owner?.subscription_tier, owner?.role);

  if (!uploadPostConfigured()) return NextResponse.json({ error: "Posting photos isn't available right now." }, { status: 503 });
  if (limit <= 0) return NextResponse.json({ error: "Posting to these platforms comes with a paid plan.", code: "plan_required" }, { status: 403 });
  if (platforms.length > limit) {
    return NextResponse.json({ error: `Your plan posts to ${limit} of these at a time. Pick ${limit}, or move up a plan to post everywhere.` }, { status: 400 });
  }
  if (!owner?.social_profile_created_at) {
    return NextResponse.json({ error: "Connect your accounts in Settings first, then post again." }, { status: 400 });
  }

  // Read every photo before anything is sent: one that cannot be opened stops
  // the post, rather than a carousel going out with a gap in it.
  const photos: { bytes: Buffer; width: number; height: number }[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      photos.push(await normalise(await fetchPhoto(urls[i]!)));
    } catch (err) {
      console.error(`[social/post-photos] photo ${i + 1} (${urls[i]!.hostname}):`, err instanceof Error ? err.message : err);
      return NextResponse.json({ error: `Photo ${i + 1} couldn't be read. Remove it or upload it again, then post.` }, { status: 400 });
    }
  }

  const username = profileUsername(user.id);
  const aiMade = body.aiMade === true;
  const extra: Record<string, string> = {
    x_title: fitCaption(caption, 280),
    threads_title: fitCaption(caption, 500),
    tiktok_title: fitCaption(caption, 90),
    // Said where the platform asks, for a picture the Image Generator drew.
    ...(aiMade ? { is_ai_generated: "true", facebook_is_ai_generated: "true" } : {}),
  };
  const asFiles = (list: Buffer[]): PhotoFile[] => list.map((bytes, i) => ({ bytes, filename: `photo-${i + 1}.jpg` }));

  const results: { platform: string; status: "posting" | "failed"; ref?: string; error?: string }[] = [];
  /** Sends one group, then writes a row per platform: waiting on success, failed on refusal. */
  const handOff = async (group: PartnerPlatform[], files: PhotoFile[]) => {
    const requestId = randomUUID();
    let ref: string | null = null;
    let reason: string | null = null;
    try {
      const accepted: PublishAccepted = await publishPhotos({
        username, platforms: group, requestId,
        title: fitCaption(caption, 2200), description: caption, extra, photos: files,
      });
      ref = storeRef(accepted);
    } catch (err) {
      reason = err instanceof SocialPublishError ? err.message : "The post couldn't be sent. Try again in a moment.";
      if (!(err instanceof SocialPublishError)) console.error("[social/post-photos] hand-off failed:", err);
    }
    for (const platform of group) {
      const { error: rowErr } = await admin.from("social_posts").insert({
        user_id: user.id, video_id: null, platform,
        // What Insights and the calendar list it under; there is no video to name it.
        video_title: fitCaption(caption.split("\n")[0], 80) || "Photo post",
        caption,
        scheduled_at: null, posted_at: null,
        post_status: ref ? "posting" : "failed",
        upload_request_id: ref,
        error_message: reason,
      });
      if (rowErr) console.error(`[social/post-photos] could not record the ${platform} post: ${rowErr.message}`);
      results.push(ref ? { platform, status: "posting", ref } : { platform, status: "failed", error: reason ?? undefined });
    }
  };

  // Instagram goes on its own: it takes fewer photos than the others and only
  // certain shapes, and trimming everyone's photos to suit it would be wrong.
  const others = platforms.filter((p) => p !== "instagram");
  if (platforms.includes("instagram")) {
    const trimmed = await Promise.all(photos.slice(0, INSTAGRAM_MAX_PHOTOS).map(forInstagram));
    await handOff(["instagram"], asFiles(trimmed));
  }
  if (others.length > 0) await handOff(others, asFiles(photos.map((p) => p.bytes)));

  return NextResponse.json({
    success: results.some((r) => r.status !== "failed"),
    results,
    pendingRefs: Array.from(new Set(results.map((r) => r.ref).filter((r): r is string => !!r))),
  });
}
