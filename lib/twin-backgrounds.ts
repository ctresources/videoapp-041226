import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Digital Twin backgrounds (2026-10-24, the owner's mockup).
 *
 * HeyGen removes the twin's own background and places them in front of
 * another (tested 2026-10-24: the upright twin full height in a 16:9 video).
 * This keeps the agent's saved backgrounds, each stored in both shapes, and
 * works out which background a video should use.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const DEFAULT_TWIN_COLOR = "#E9E3D6";
export const TWIN_BACKGROUNDS_PER_MONTH = 20;

export interface TwinBackgroundRow {
  id: string; name: string; kind: "described" | "town" | "listing";
  prompt: string | null; wide_url: string; tall_url: string | null; created_at: string;
}

/**
 * Where the twin stands in front of the photos and footage (2026-10-31):
 * full height on the right, or smaller in the bottom-right corner.
 */
export type TwinFootageLayout = "side" | "corner";

/**
 * What the editor or a setting asks for: a saved background, a color, the
 * circle, or the video's own photos and footage behind a see-through twin.
 */
export type TwinBgChoice =
  | { type: "saved"; id: string }
  | { type: "color"; value: string }
  | { type: "circle" }
  | { type: "footage"; layout: TwinFootageLayout };

/** What HeyGen is sent. */
export type TwinBackdrop = { type: "color"; value: string } | { type: "image"; url: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function parseLayout(raw: unknown): TwinFootageLayout {
  return raw === "corner" ? "corner" : "side";
}

export function parseChoice(raw: unknown): TwinBgChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type === "circle") return { type: "circle" };
  if (r.type === "footage") return { type: "footage", layout: parseLayout(r.layout) };
  if (r.type === "color" && typeof r.value === "string" && HEX.test(r.value)) return { type: "color", value: r.value };
  if (r.type === "saved" && typeof r.id === "string" && /^[0-9a-f-]{36}$/i.test(r.id)) return { type: "saved", id: r.id };
  return null;
}

/**
 * A picture saved as one of the agent's backgrounds, in both shapes
 * (1920×1080 and 1080×1920, cropped to fill: a background has nothing at its
 * edges that matters, and it is behind the presenter anyway).
 */
export async function saveTwinBackground(
  admin: Admin, userId: string, input: Buffer,
  meta: { name: string; kind: TwinBackgroundRow["kind"]; prompt?: string | null },
): Promise<TwinBackgroundRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sharp = ((await import("sharp")) as any).default;
  const upright = await sharp(input).rotate().toBuffer();
  const [wide, tall] = await Promise.all([
    sharp(upright).resize(1920, 1080, { fit: "cover", position: "centre" }).jpeg({ quality: 86 }).toBuffer(),
    sharp(upright).resize(1080, 1920, { fit: "cover", position: "centre" }).jpeg({ quality: 86 }).toBuffer(),
  ]);
  const id = randomUUID();
  const urls: Record<string, string> = {};
  for (const [shape, buf] of [["wide", wide], ["tall", tall]] as const) {
    const path = `${userId}/twin-bg/${id}-${shape}.jpg`;
    const { error } = await admin.storage.from("assets").upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`Couldn't save the background (${error.message}).`);
    urls[shape] = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;
  }
  const { data, error } = await admin
    .from("twin_backgrounds")
    .insert({ id, user_id: userId, name: meta.name.slice(0, 80), kind: meta.kind, prompt: meta.prompt ?? null, wide_url: urls.wide, tall_url: urls.tall })
    .select("id, name, kind, prompt, wide_url, tall_url, created_at")
    .single();
  if (error || !data) throw new Error("Couldn't save the background.");
  return data as TwinBackgroundRow;
}

/**
 * Which background a horizontal twin video uses, or null for the circle.
 *
 * The video's own choice first (the editor's Background row); then the
 * agent's setting: "circle" keeps the circle, otherwise their default
 * background, else the studio color.
 */
export async function resolveTwinBackdrop(
  admin: Admin, userId: string,
  asked: TwinBgChoice | null,
  profile: { twin_wide_mode?: string | null; twin_default_bg?: unknown },
): Promise<TwinBackdrop | null> {
  // "Photos & footage" is decided before this (twinFootageLayout); where it
  // can't be used (an Agent Intro, a long video) the agent's default
  // background stands in.
  let choice: TwinBgChoice | null = asked?.type === "footage" ? null : asked;
  if (!choice) {
    if (profile.twin_wide_mode === "circle") return null;
    choice = parseChoice(profile.twin_default_bg) ?? { type: "color", value: DEFAULT_TWIN_COLOR };
  }
  if (choice.type === "circle") return null;
  if (choice.type === "footage") return { type: "color", value: DEFAULT_TWIN_COLOR };
  if (choice.type === "color") return { type: "color", value: choice.value };
  const { data } = await admin
    .from("twin_backgrounds")
    .select("wide_url")
    .eq("id", choice.id)
    .eq("user_id", userId)
    .maybeSingle();
  const url = (data as { wide_url: string } | null)?.wide_url;
  // A deleted background falls back to the studio color rather than failing the video.
  return url ? { type: "image", url } : { type: "color", value: DEFAULT_TWIN_COLOR };
}

/**
 * Whether this video puts the see-through twin in front of its own photos
 * and footage, and where they stand; null for a background or the circle.
 *
 * The video's own choice first, then the agent's Wide videos setting. Short
 * videos only: the layering re-encodes every frame on the server, and a long
 * video would not finish in time (75 s for 2 minutes on one core, measured
 * 2026-10-31). Not the Agent Intro, which has no photos to stand in front of.
 */
export function twinFootageLayout(
  asked: TwinBgChoice | null,
  profile: { twin_wide_mode?: string | null; twin_footage_layout?: string | null },
  video: { isLongForm: boolean; isAgentIntro: boolean },
): TwinFootageLayout | null {
  if (video.isLongForm || video.isAgentIntro) return null;
  if (asked) return asked.type === "footage" ? asked.layout : null;
  return profile.twin_wide_mode === "footage" ? parseLayout(profile.twin_footage_layout) : null;
}
