import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import type { createAdminClient } from "@/lib/supabase/admin";
import { generateVideoV3, lookOrientation, searchBackgroundMusic } from "@/lib/api/heygen";
import { generateSeoData } from "@/lib/api/perplexity";
import { mixBackgroundMusic } from "@/lib/utils/mix-music";
import { generateTwinBackdrop } from "@/lib/api/openai-image";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chargeOneVideo, ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { ensureVoiceForRender } from "@/lib/utils/voice-slot";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { ensureProjectThumbnail } from "@/lib/utils/thumbnail-render";
import { announceVideoReady } from "@/lib/video/ready-notice";
import { canUseDigitalTwin } from "@/lib/utils/plan-features";
import { hasAdminPerks } from "@/lib/utils/roles";
import { designById, introBackground, SIZE, wordsLayer, type Circle, type DesignId, type Shape } from "@/lib/templates/designs";
import { addWords, composeClean, secondsOf } from "@/lib/templates/compose";
import { animatedProject, renderAnimatedWords } from "@/lib/templates/animated";

/** The words, animated by HyperFrames; null (still words) if that fails. */
async function animateWords(rec: TemplateRecord, fields: Record<string, string>, seconds: number, logo: Buffer | null, key: string): Promise<Buffer | null> {
  if (!seconds) return null;
  try {
    const logoPng = rec.design === "agent_intro" && logo ? await sharp(logo).png().toBuffer() : null;
    const project = animatedProject({ design: rec.design, shape: rec.shape, fields, accent: rec.accent, seconds, logo: logoPng, circle: rec.circle });
    return await renderAnimatedWords(project, rec.shape, key);
  } catch (err) {
    console.warn("[templates] animated words skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** Music under the voice (2026-11-03, the owner's ask): a library track to suit each design. */
const MUSIC: Record<DesignId, string> = {
  just_listed: "upbeat inspiring corporate",
  luxury: "elegant cinematic piano",
  market_update: "modern corporate news",
  neighborhood: "warm acoustic upbeat",
  agent_intro: "warm inspiring corporate",
};
async function pickMusic(design: DesignId): Promise<string | null> {
  try {
    const tracks = (await searchBackgroundMusic(MUSIC[design], 3)).filter((t) => /^https:\/\//.test(t.audio_url ?? ""));
    return tracks.length ? tracks[Math.floor(Math.random() * tracks.length)].audio_url : null;
  } catch (err) {
    console.warn("[templates] music lookup skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * The post's title, description and hashtags (2026-11-03): template videos
 * reached Publish with only a title. Written from the script and the words on
 * screen, onto the project, unless it already has post copy.
 */
async function writePostCopy(admin: Admin, projectId: string | null, title: string, rec: TemplateRecord): Promise<void> {
  if (!projectId) return;
  try {
    const { data } = await admin.from("projects").select("ai_script, seo_data").eq("id", projectId).single();
    const pr = data as { ai_script: { script?: string } | null; seo_data: Record<string, unknown> | null } | null;
    if (pr?.seo_data && Object.keys(pr.seo_data).length) return;
    const onScreen = Object.entries(rec.fields).filter(([k, v]) => k !== "bg" && v?.trim()).map(([, v]) => v).join(". ");
    const source = [pr?.ai_script?.script ?? "", onScreen].filter(Boolean).join("\n");
    const keywords = [rec.fields.address, rec.fields.title, rec.fields.name].filter((x): x is string => !!x?.trim());
    const seo = await Promise.race([
      generateSeoData(title, source || title, keywords),
      new Promise<null>((r) => setTimeout(() => r(null), 45_000)),
    ]);
    if (seo) await admin.from("projects").update({ seo_data: { ...seo, youtube_title: seo.youtube_title || title } }).eq("id", projectId);
  } catch (err) {
    console.warn("[templates] post copy skipped:", err instanceof Error ? err.message : err);
  }
}

/**
 * Video templates, start to finish (2026-11-02, the owner's approved mockup).
 *  1. makeTemplateVideo: HeyGen renders the agent saying the script (callback
 *     "<row id>:tpl"); one short video is charged once HeyGen has it.
 *  2. finishTemplateVideo (from the webhook): photos + circle → clean.mp4,
 *     kept; words on top → the video in My Sparks.
 *  3. rewordTemplateVideo: new words over the kept clean.mp4. No new render.
 */

export interface TemplateRecord {
  design: DesignId; shape: Shape; fields: Record<string, string>; photos: string[]; accent: string;
  clean?: string; logo?: string | null;
  /** The music track under the voice (mixed into clean, so new words keep it). */
  music?: string | null;
  /** Music On/Off on the page (2026-11-03); on unless turned off. */
  musicOn?: boolean;
  /** Where the face circle was put in this video (kept so new words line up with it). */
  circle?: Circle;
}

const PROFILE = `${ALLOWANCE_SELECT}, role, subscription_tier, full_name, company_name, phone, company_phone, mobile_phone, website, location_city, location_state, brand_colors, logo_url, photo_wide_url, photo_tall_url, avatar_url, heygen_voice_id, voice_sample_url, heygen_look_wide, heygen_look_tall, heygen_digital_twin_look_id, twin_consent_needed`;
export interface TemplateProfile {
  role: string | null; subscription_tier: string | null; full_name: string | null; company_name: string | null;
  phone: string | null; company_phone: string | null; mobile_phone: string | null; website: string | null;
  location_city: string | null; location_state: string | null; brand_colors: string[] | null; logo_url: string | null;
  photo_wide_url: string | null; photo_tall_url: string | null; avatar_url: string | null;
  heygen_voice_id: string | null; voice_sample_url: string | null; heygen_look_wide: string | null; heygen_look_tall: string | null;
  heygen_digital_twin_look_id: string | null; twin_consent_needed: boolean | null;
}
export async function templateProfile(admin: Admin, userId: string) {
  const { data } = await admin.from("profiles").select(PROFILE).eq("id", userId).single();
  return data as unknown as TemplateProfile | null;
}
export const accentOf = (p: TemplateProfile | null) => {
  const c = (p?.brand_colors ?? []).find((x) => /^#[0-9a-f]{6}$/i.test(x ?? ""));
  return c ?? "#e7b84a";
};
/** Which faces the agent can put on screen: an approved Digital Twin, a headshot avatar. */
export const facesOf = (p: TemplateProfile | null) => ({
  twin: !!p?.heygen_digital_twin_look_id && !p.twin_consent_needed && canUseDigitalTwin(p.subscription_tier, p.role),
  avatar: !!(p?.heygen_look_wide || p?.heygen_look_tall),
});
/** A Market Update needs at least one of its three numbers. */
export const hasNumbers = (f: Record<string, string>) => ["s1", "s2", "s3"].some((k) => (f[k] ?? "").trim());
export const phoneOf = (p: TemplateProfile | null) => p?.mobile_phone || p?.phone || p?.company_phone || null;

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
async function download(url: string, file: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Couldn't download a picture or video (${r.status}).`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
}

/** A short spoken script for the design, from the words on screen. */
export async function writeTemplateScript(o: { design: DesignId; shape: Shape; fields: Record<string, string>; name: string | null; city: string | null }): Promise<string> {
  const d = designById(o.design)!;
  const words = o.shape === "vertical" ? 75 : 105;
  const system = `You write short spoken scripts for a real estate agent's ${d.name} video. First person, warm and confident, plain spoken English, short sentences, no stage directions, no emojis, no hashtags. About ${words} words (never more than ${words + 15}). Use only the facts given; never invent numbers, features or promises. End with one short line inviting viewers to call or message the agent. Return ONLY JSON: {"script":"..."}`;
  const facts = Object.entries(o.fields).filter(([k, v]) => k !== "bg" && v?.trim()).map(([k, v]) => `${k}: ${v}`).join("\n");
  const user = `Agent: ${o.name ?? "the agent"}${o.city ? `, ${o.city}` : ""}\nWords on screen:\n${facts}`;
  const out = await openaiChatJson(system, [{ role: "user", content: user }], { label: "template-script", maxTokens: 600, timeoutMs: 30_000 });
  const s = typeof out?.script === "string" ? out.script.trim() : "";
  if (!s) throw new Error("Couldn't write the script. Try again.");
  return s.slice(0, 1500);
}

/** Starts the video. Returns the My Sparks row and project. */
export async function makeTemplateVideo(admin: Admin, user: { id: string }, o: {
  design: DesignId; shape: Shape; fields: Record<string, string>; photos: string[]; script: string; title: string;
  /** Who's on screen, when the agent has both. */
  face?: "twin" | "avatar";
  /** Music under the voice; on unless false. */
  music?: boolean;
}): Promise<{ videoId: string; projectId: string } | { error: string; status: number; code?: string }> {
  const d = designById(o.design);
  if (!d) return { error: "Pick a design.", status: 400 };
  if (o.design === "market_update" && !hasNumbers(o.fields)) return { error: "Add at least one number first.", status: 400 };
  const script = o.script.trim();
  if (!script) return { error: "Write the script first.", status: 400 };
  if (script.split(/\s+/).length > 260) return { error: "Keep the script under about 2 minutes (260 words).", status: 400 };
  const photos = o.photos.filter((u) => /^https:\/\//.test(u)).slice(0, 12);
  if (d.photos === "listing" && photos.length === 0) return { error: "Add at least one photo of the home.", status: 400 };

  const p = await templateProfile(admin, user.id);
  if (!p) return { error: "Profile not found.", status: 400 };
  const isAdmin = hasAdminPerks(p.role);
  if (!isAdmin && availableFor(p as never, "short") < 1) return { error: "You don't have a short video left this month.", status: 402, code: "out_of_videos" };

  // Who's on screen: their pick; else their approved Digital Twin, else the headshot look for this shape.
  const faces = facesOf(p);
  const twinOk = faces.twin && (o.face !== "avatar" || !faces.avatar);
  const lookId = twinOk ? p.heygen_digital_twin_look_id! : (o.shape === "vertical" ? p.heygen_look_tall ?? p.heygen_look_wide : p.heygen_look_wide ?? p.heygen_look_tall);
  if (!lookId) return { error: "Add your headshot in Settings first.", status: 409, code: "no_headshot" };
  const voiceId = await ensureVoiceForRender({ id: user.id, heygen_voice_id: p.heygen_voice_id, voice_sample_url: p.voice_sample_url });
  if (!voiceId) return { error: "Set up your voice in Settings first.", status: 409 };

  const { data: project } = await admin.from("projects").insert({
    user_id: user.id, title: o.title, project_type: "location_script", status: "draft",
    ai_script: { kind: "template", title: o.title, hook: "", script, cta: "", description: "", hashtags: [], template: { design: o.design, shape: o.shape } },
  }).select("id").single();
  if (!project) return { error: "Couldn't start the video.", status: 500 };
  const projectId = (project as { id: string }).id;
  const record: TemplateRecord = { design: o.design, shape: o.shape, fields: o.fields, photos, accent: accentOf(p), logo: p.logo_url, musicOn: o.music !== false };
  const { w, h } = SIZE[o.shape];
  const { data: row } = await admin.from("generated_videos").insert({
    project_id: projectId, user_id: user.id, video_type: o.shape === "vertical" ? "reel_9x16" : "youtube_16x9",
    render_provider: "template", render_status: "rendering",
    metadata: { title: o.title, dimension: { width: w, height: h }, orientation: o.shape === "vertical" ? "portrait" : "landscape", template: record, heygen_engine: "avatar_iii", is_digital_twin: twinOk },
  }).select("id, metadata").single();
  if (!row) {
    // Don't leave an empty draft behind in My Sparks.
    await admin.from("projects").delete().eq("id", projectId);
    return { error: "Couldn't start the video. Nothing was charged.", status: 500 };
  }
  const videoId = (row as { id: string }).id;

  // The render: the agent's own shape (a wide twin renders wide, a tall headshot tall).
  const orient = await lookOrientation(lookId).catch(() => null);
  const dimension = orient === "portrait" ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
  let job: string;
  try {
    job = await generateVideoV3({
      avatarId: lookId, voiceId, scriptText: script, dimension, title: o.title, engine: "avatar_iii",
      callbackUrl: buildCallbackUrl(), callbackId: `${videoId}:tpl`, idempotencyKey: `${videoId}-tpl`,
    });
  } catch (err) {
    console.error("[templates] submit failed:", err instanceof Error ? err.message : err);
    await admin.from("generated_videos").update({ render_status: "failed", metadata: { ...(row as { metadata: Record<string, unknown> }).metadata, render_error: "The video couldn't be started. Nothing was charged." } }).eq("id", videoId);
    return { error: "The video couldn't be started. Nothing was charged. Try again.", status: 502 };
  }
  const source = isAdmin ? null : (await chargeOneVideo(admin, user.id, "short"))?.source ?? null;
  await admin.from("generated_videos").update({
    render_job_id: job,
    metadata: { ...(row as { metadata: Record<string, unknown> }).metadata, credit_cost: isAdmin ? 0 : 1, credit_kind: "short", credit_source: source ?? "plan" },
  }).eq("id", videoId);
  return { videoId, projectId };
}

async function failVideo(admin: Admin, rowId: string, reason: string) {
  const { data } = await admin.from("generated_videos").select("metadata, project_id").eq("id", rowId).single();
  const r = data as { metadata: Record<string, unknown> | null; project_id: string | null } | null;
  await admin.from("generated_videos").update({ render_status: "failed", metadata: { ...(r?.metadata ?? {}), render_error: reason } }).eq("id", rowId);
  if (r?.project_id) await admin.from("projects").update({ status: "error" }).eq("id", r.project_id);
  await refundVideoCredits(admin, rowId);
}

/** From the webhook: HeyGen finished (or failed) the agent's render. Returns the finishing work. */
export async function templateRenderDone(admin: Admin, callbackId: string, o: { success: boolean; videoUrl?: string; failure?: string }): Promise<Promise<void> | null> {
  const rowId = callbackId.replace(/:tpl$/, "");
  if (!o.success || !o.videoUrl) {
    await failVideo(admin, rowId, "The video couldn't be made. Nothing was charged — please try again.");
    return null;
  }
  // Claim it, so repeated deliveries don't finish it twice.
  const { data: row } = await admin.from("generated_videos").select("metadata").eq("id", rowId).single();
  const meta = ((row as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {});
  const { data: claimed } = await admin.from("generated_videos")
    .update({ metadata: { ...meta, template_render_url: o.videoUrl, template_finishing_at: new Date().toISOString() } })
    .eq("id", rowId).is("metadata->>template_finishing_at", null).select("id");
  if (!claimed?.length) return null;
  return finishTemplateVideo(admin, rowId, o.videoUrl);
}

/** A picture of the place when the agent didn't give one (Market Update, Neighborhood). */
async function placePhoto(admin: Admin, userId: string, shape: Shape, place: string): Promise<string | null> {
  const bytes = await generateTwinBackdrop({ description: `a beautiful sunny street view of ${place}, homes and trees, inviting, real estate`, orientation: shape === "vertical" ? "portrait" : "landscape" });
  if (!bytes) return null;
  const p = `${userId}/templates/place-${Date.now()}.png`;
  const { error } = await admin.storage.from("assets").upload(p, bytes, { contentType: "image/png", upsert: false });
  return error ? null : admin.storage.from("assets").getPublicUrl(p).data.publicUrl;
}

export async function finishTemplateVideo(admin: Admin, rowId: string, renderUrl: string): Promise<void> {
  const work = tmp("tpl-");
  const t0 = Date.now();
  try {
    const { data } = await admin.from("generated_videos").select("id, user_id, project_id, metadata").eq("id", rowId).single();
    const row = data as { id: string; user_id: string; project_id: string | null; metadata: Record<string, unknown> } | null;
    if (!row) return;
    const rec = row.metadata.template as TemplateRecord;
    const d = designById(rec.design)!;
    // Started now, so they're ready by the time the video is put together.
    const musicFinding = rec.musicOn === false ? Promise.resolve(null) : pickMusic(rec.design);
    const postCopy = writePostCopy(admin, row.project_id, String(row.metadata.title ?? d.name), rec);

    let photos = rec.photos;
    if (d.photos === "place" && photos.length === 0) {
      const place = rec.fields.name || rec.fields.title || "a friendly American town";
      const url = await placePhoto(admin, row.user_id, rec.shape, place);
      if (url) photos = [url];
    }
    const avatar = await download(renderUrl, path.join(work, "avatar.mp4"));
    const local = await Promise.all(photos.map((u, i) => download(u, path.join(work, `photo-${i}`)).catch(() => null)));
    const still = d.photos === "none" ? path.join(work, "still.png") : null;
    if (still) fs.writeFileSync(still, await introBackground(rec.shape, rec.accent));
    const logo = rec.logo ? await fetch(rec.logo).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? Buffer.from(b) : null)).catch(() => null) : null;
    const { png, circle } = await wordsLayer(rec.design, rec.shape, rec.fields, rec.accent, logo);

    const usable = local.filter((x): x is string => !!x);
    if (d.photos !== "none" && usable.length === 0) {
      // No picture at all: a plain tinted background rather than a failed video.
      fs.writeFileSync(path.join(work, "plain.png"), await introBackground(rec.shape, rec.accent));
    }
    const clean = await composeClean({
      workDir: work, shape: rec.shape, circle, avatar,
      photos: usable, still: still ?? (usable.length ? null : path.join(work, "plain.png")), threads: 1,
    });
    // Music under the voice, mixed into the kept video so Edit the words keeps it.
    const music = await musicFinding;
    if (music) {
      // 2 dB under the app's usual bed (the owner found it a little high).
      const mixed = await mixBackgroundMusic(fs.readFileSync(clean), music, { trimDb: -2 });
      if (mixed) fs.writeFileSync(clean, mixed);
    }
    // The words animated (HyperFrames), else the still words.
    const animated = await animateWords(rec, rec.fields, await secondsOf(clean), logo, `${rowId}-words-1`);
    const final = await addWords({ workDir: work, clean, words: png, threads: 1, animated });
    console.log(`[templates] ${rowId} put together in ${Math.round((Date.now() - t0) / 1000)}s (${animated ? "animated" : "still"} words)`);

    const cleanPath = `${row.user_id}/${rowId}-clean.mp4`;
    const finalPath = `${row.user_id}/${rowId}.mp4`;
    const up1 = await admin.storage.from("videos").upload(cleanPath, fs.readFileSync(clean), { contentType: "video/mp4", upsert: true });
    const up2 = await admin.storage.from("videos").upload(finalPath, fs.readFileSync(final), { contentType: "video/mp4", upsert: true });
    if (up1.error || up2.error) throw new Error(`Couldn't store the video: ${(up1.error ?? up2.error)!.message}`);
    const pub = (p: string) => admin.storage.from("videos").getPublicUrl(p).data.publicUrl;
    await admin.from("generated_videos").update({
      render_status: "completed", video_url: `${pub(finalPath)}?v=${Date.now()}`, render_finished_at: new Date().toISOString(),
      metadata: { ...row.metadata, template: { ...rec, photos, clean: pub(cleanPath), animated: !!animated, circle, music: music ?? null } },
    }).eq("id", rowId);
    await postCopy;
    if (row.project_id) {
      await admin.from("projects").update({ status: "ready" }).eq("id", row.project_id);
      await ensureProjectThumbnail(row.project_id, row.user_id).catch(() => {});
    }
    await announceVideoReady(admin, rowId).catch(() => {});
  } catch (err) {
    console.error(`[templates] ${rowId} finish failed:`, err instanceof Error ? err.message : err);
    await failVideo(admin, rowId, "The video couldn't be put together. Nothing was charged — please try again.");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** New words over the kept clean video. No new render, nothing charged. */
export async function rewordTemplateVideo(admin: Admin, userId: string, rowId: string, fields: Record<string, string>): Promise<{ videoUrl: string } | { error: string }> {
  const { data } = await admin.from("generated_videos").select("id, user_id, metadata").eq("id", rowId).eq("user_id", userId).single();
  const row = data as { id: string; user_id: string; metadata: Record<string, unknown> } | null;
  const rec = row?.metadata?.template as TemplateRecord | undefined;
  if (!row || !rec?.clean) return { error: "This video can't have its words changed." };
  const design = designById(rec.design)!;
  const clean: Record<string, string> = {};
  for (const f of design.fields) clean[f.key] = String(fields[f.key] ?? rec.fields[f.key] ?? "").slice(0, 160);
  // The background color rides with the words.
  clean.bg = String(fields.bg ?? rec.fields.bg ?? "").slice(0, 20);
  const work = tmp("tplw-");
  try {
    const cleanFile = await download(rec.clean, path.join(work, "clean.mp4"));
    const logo = rec.logo ? await fetch(rec.logo).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? Buffer.from(b) : null)).catch(() => null) : null;
    const { png } = await wordsLayer(rec.design, rec.shape, clean, rec.accent, logo, rec.circle);
    const animated = await animateWords(rec, clean, await secondsOf(cleanFile), logo, `${rowId}-words-${Date.now()}`);
    const final = await addWords({ workDir: work, clean: cleanFile, words: png, threads: 1, animated });
    const finalPath = `${row.user_id}/${rowId}.mp4`;
    const { error } = await admin.storage.from("videos").upload(finalPath, fs.readFileSync(final), { contentType: "video/mp4", upsert: true });
    if (error) return { error: "Couldn't save it. Try again." };
    const videoUrl = `${admin.storage.from("videos").getPublicUrl(finalPath).data.publicUrl}?v=${Date.now()}`;
    await admin.from("generated_videos").update({ video_url: videoUrl, metadata: { ...row.metadata, template: { ...rec, fields: clean } } }).eq("id", rowId);
    return { videoUrl };
  } catch (err) {
    console.error(`[templates] reword ${rowId} failed:`, err instanceof Error ? err.message : err);
    return { error: "Couldn't change the words. Try again." };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/** A still preview: the first photo (or the intro background), the agent's headshot in the circle, and the words. */
export async function previewImage(o: { design: DesignId; shape: Shape; fields: Record<string, string>; photo?: string | null; p: TemplateProfile | null }): Promise<Buffer> {
  const { w, h } = SIZE[o.shape];
  const accent = accentOf(o.p);
  const d = designById(o.design)!;
  let bg: Buffer;
  const photoBuf = o.photo && d.photos !== "none" ? await fetch(o.photo).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
  if (photoBuf) bg = await sharp(Buffer.from(photoBuf)).resize(w, h, { fit: "cover" }).png().toBuffer();
  else bg = await introBackground(o.shape, accent);
  const logo = o.p?.logo_url ? await fetch(o.p.logo_url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? Buffer.from(b) : null)).catch(() => null) : null;
  const { png, circle } = await wordsLayer(o.design, o.shape, o.fields, accent, logo);
  const dd = Math.round(circle.d);
  const headUrl = o.p?.photo_tall_url || o.p?.avatar_url || o.p?.photo_wide_url;
  const head = headUrl ? await fetch(headUrl).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
  const disc = await sharp(head ? Buffer.from(head) : { create: { width: dd, height: dd, channels: 4, background: "#9a8f80" } } as never)
    .resize(dd, dd, { fit: "cover", position: "top" })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${dd}" height="${dd}"><circle cx="${dd / 2}" cy="${dd / 2}" r="${dd / 2}" fill="#fff"/></svg>`), blend: "dest-in" }])
    .png().toBuffer();
  const out = await sharp(bg).composite([
    { input: disc, left: Math.round(circle.cx - dd / 2), top: Math.round(circle.cy - dd / 2) },
    { input: png, left: 0, top: 0 },
  ]).png().toBuffer();
  return sharp(out).resize(o.shape === "vertical" ? 405 : 720).jpeg({ quality: 82 }).toBuffer();
}
