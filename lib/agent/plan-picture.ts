import { createHash } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageBackground } from "@/lib/api/openai-image";

/**
 * The picture on a Spark plan (2026-11-22, the owner's ask, after ChatGPT
 * decorated a plan with a photo from someone else's website).
 *
 * - Made from the video's topic and town by the app's own image generator
 *   (its article style: no faces, no readable text), in the video's shape.
 * - One per plan, reused while the topic and shape stay the same, 10 new
 *   ones a day per account. Uses no videos and none of the 100 monthly images.
 * - A specific listing is never drawn by AI, since a made-up house would
 *   misrepresent it: it gets a real photo of that listing, or no picture.
 * - If anything fails, the plan simply has no picture.
 */

export interface PlanPicture {
  url: string;
  key: string;
  /** True only when this plan paid for a new image (counts toward the daily cap). */
  made: boolean;
  source: "topic" | "listing";
}

const DAILY_CAP = 10;
const GENERATE_TIMEOUT_MS = 40_000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** A real photo of the listing the goal names, from the agent's own saved listings. */
async function listingPhoto(userId: string, goal: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("projects")
    .select("listing_data")
    .eq("user_id", userId)
    .not("listing_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(40);
  const text = norm(goal);
  for (const row of (data ?? []) as { listing_data: { address?: unknown; photoUrls?: unknown } | null }[]) {
    const street = norm(String(row.listing_data?.address ?? "").split(",")[0]);
    // A house number and street name, so it can't match the wrong home.
    if (!/^\d+ \S+/.test(street) || !text.includes(street)) continue;
    const photos = row.listing_data?.photoUrls;
    const first = Array.isArray(photos) ? photos.find((u): u is string => typeof u === "string" && u.startsWith("https://")) : null;
    if (first) return first;
  }
  return null;
}

export async function pictureForPlan(
  userId: string,
  o: { topic: string; goal: string; shape: "vertical" | "wide"; city?: string | null; state?: string | null; isListing?: boolean; previous?: PlanPicture | null },
): Promise<PlanPicture | null> {
  try {
    if (o.isListing) {
      const url = await listingPhoto(userId, o.goal);
      return url ? { url, key: "listing", made: false, source: "listing" } : null;
    }

    const key = createHash("sha256").update(norm([o.topic, o.shape, o.city ?? "", o.state ?? ""].join("|"))).digest("hex").slice(0, 24);
    if (o.previous?.key === key) return { ...o.previous, made: false };

    const admin = createAdminClient();
    const { data: same } = await admin
      .from("agent_plans")
      .select("totals")
      .eq("user_id", userId)
      .eq("totals->picture->>key", key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const earlier = (same as { totals: { picture?: PlanPicture } } | null)?.totals?.picture;
    if (earlier?.url) return { ...earlier, made: false };

    const { count } = await admin
      .from("agent_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("totals->picture->>made", "true")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if ((count ?? 0) >= DAILY_CAP) return null;

    const image = await Promise.race([
      generateImageBackground({
        template: "blog_header",
        scene: o.topic.slice(0, 300),
        city: o.city ?? undefined,
        state: o.state ?? undefined,
        orientation: o.shape === "vertical" ? "portrait" : "landscape",
        variant: 0,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), GENERATE_TIMEOUT_MS)),
    ]);
    if (!image) return null;

    const jpeg = await sharp(image).resize({ width: o.shape === "vertical" ? 640 : 960, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const path = `thumbnails/${userId}/plan_${key}.jpg`;
    const { error } = await admin.storage.from("assets").upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (error) {
      console.error("[agent/plan-picture] upload failed:", error.message);
      return null;
    }
    const url = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
    return { url, key, made: true, source: "topic" };
  } catch (e) {
    console.error("[agent/plan-picture] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
