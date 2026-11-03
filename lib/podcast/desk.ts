import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import type { createAdminClient } from "@/lib/supabase/admin";
import { speakInVoice } from "@/lib/api/heygen";
import { generatePodcastDesk } from "@/lib/api/openai-image";
import { chargeOneVideo } from "@/lib/utils/video-allowance";
import { refundVideoCredits } from "@/lib/utils/refund-credits";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { ensureProjectThumbnail } from "@/lib/utils/thumbnail-render";
import { announceVideoReady } from "@/lib/video/ready-notice";
import { composeDesk, type DeskTurn } from "@/lib/podcast/desk-compose";
import { studioSetUrl, type StudioSetId, type Turn, PODCAST_LONG_VIDEOS } from "@/lib/podcast/podcast";
import { copyEpisodeToPartner } from "@/lib/podcast/partners";

const run = promisify(execFile);
type Admin = ReturnType<typeof createAdminClient>;
const HEYGEN_API = "https://api.heygen.com";
const key = () => process.env.HEYGEN_API_KEY ?? "";

/**
 * A Spark Podcast episode at the desk (2026-11-02, from the owner's approved
 * prototype). See lib/podcast/desk-compose.ts for why it's built this way.
 *
 *  1. startDeskEpisode (the make route, in the background): each line spoken
 *     in its speaker's voice, a full-length track per speaker, and two
 *     see-through renders, one per person. Charged one long video once HeyGen
 *     has both.
 *  2. deskPartDone (the webhook): each render reports back on its own; when
 *     both are in, finishDeskEpisode puts the shots together and stores it.
 */

export interface DeskSpeaker { lookId: string; voiceId: string }
export interface DeskWord { word: string; start: number; end: number }
export interface DeskLine extends DeskTurn { text: string; words: DeskWord[] }
export interface DeskRecord {
  setId: StudioSetId;
  total?: number;
  lines?: DeskLine[];
  guestScale: number;
  guestLift: number;
  partner?: { partnerId: string; hostName: string } | null;
  audio?: string;
  parts: Record<string, { job?: string; url?: string; failed?: string }>;
  composing_at?: string;
  error?: string;
}

const GAP = 0.35;

async function durationOf(file: string): Promise<number> {
  try { await run(ffmpegPath.path, ["-hide_banner", "-i", file]); }
  catch (e) {
    const m = String((e as { stderr?: string }).stderr ?? "").match(/Duration: (\d+):(\d+):([\d.]+)/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
  return 0;
}

/** The desk picture, made once for everyone; null if it can't be made (a plain desk is drawn instead). */
export async function deskImageUrl(admin: Admin): Promise<string | null> {
  const p = "podcast-sets/desk.png";
  const url = admin.storage.from("assets").getPublicUrl(p).data.publicUrl;
  const head = await fetch(url, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return url;
  const bytes = await generatePodcastDesk();
  if (!bytes) return null;
  const { error } = await admin.storage.from("assets").upload(p, bytes, { contentType: "image/png", upsert: true });
  return error ? null : url;
}

async function failEpisode(admin: Admin, rowId: string, reason: string) {
  const { data } = await admin.from("generated_videos").select("metadata, project_id").eq("id", rowId).single();
  const row = data as { metadata: Record<string, unknown> | null; project_id: string | null } | null;
  await admin.from("generated_videos").update({ render_status: "failed", metadata: { ...(row?.metadata ?? {}), render_error: reason } }).eq("id", rowId);
  if (row?.project_id) await admin.from("projects").update({ status: "error" }).eq("id", row.project_id);
  await refundVideoCredits(admin, rowId);
}

async function speak(text: string, voiceId: string) {
  for (let attempt = 0; ; attempt++) {
    try { return await speakInVoice(text, voiceId, 90_000); }
    catch (err) {
      // 30 speech requests a minute, account-wide: wait and try again.
      if (attempt < 3 && /429|rate/i.test(err instanceof Error ? err.message : "")) { await new Promise((r) => setTimeout(r, 8000 * (attempt + 1))); continue; }
      throw err;
    }
  }
}

async function submitLayer(o: { lookId: string; audioUrl: string; rowId: string; part: "host" | "guest"; title: string }): Promise<string> {
  const callbackUrl = buildCallbackUrl();
  const res = await fetch(`${HEYGEN_API}/v3/videos`, {
    method: "POST",
    headers: { "x-api-key": key(), "Content-Type": "application/json", "Idempotency-Key": `${o.rowId}-${o.part}` },
    body: JSON.stringify({
      type: "avatar", avatar_id: o.lookId, audio_url: o.audioUrl, title: `${o.title.slice(0, 80)} (${o.part})`,
      aspect_ratio: "16:9", resolution: "720p", engine: { type: "avatar_iii" },
      // See-through: the person alone, to sit on the set behind the desk.
      output_format: "webm",
      ...(callbackUrl && { callback_url: callbackUrl }),
      callback_id: `${o.rowId}:${o.part}`,
    }),
  });
  const text = await res.text();
  console.log(`[podcast-desk] ${o.part} submit ${res.status}: ${text.slice(0, 300)}`);
  if (!res.ok) throw new Error(`The ${o.part === "host" ? "host" : "co-host"} couldn't be started (${res.status}).`);
  const id = (JSON.parse(text) as { data?: { video_id?: string } }).data?.video_id;
  if (!id) throw new Error("No video id came back.");
  return id;
}

/** Step 1, in the background after the make route answers. */
export async function startDeskEpisode(admin: Admin, o: {
  rowId: string; userId: string; title: string; turns: Turn[];
  host: DeskSpeaker; guest: DeskSpeaker; isAdmin: boolean;
}): Promise<void> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "desk-"));
  try {
    // Every line in its speaker's voice, one after another (the speech limit).
    const lines: DeskLine[] = [];
    let t = 0.4;
    for (let i = 0; i < o.turns.length; i++) {
      const turn = o.turns[i];
      const s = await speak(turn.text, turn.speaker === "host" ? o.host.voiceId : o.guest.voiceId);
      const file = path.join(work, `line-${String(i).padStart(2, "0")}.mp3`);
      fs.writeFileSync(file, s.audioBuffer);
      const d = await durationOf(file) || s.wordTimestamps.at(-1)?.end || 2;
      lines.push({ speaker: turn.speaker, text: turn.text, start: t, end: t + d, words: s.wordTimestamps });
      t += d + GAP;
      await new Promise((r) => setTimeout(r, 2100));
    }
    const total = t + 0.6;

    // One track per speaker (silent while the other talks), and both together.
    const silence = (d: number) => `aevalsrc=0|0:s=48000:d=${Math.max(0.01, d).toFixed(3)}`;
    const tracks: Record<string, string> = {};
    for (const who of ["host", "guest", "all"] as const) {
      const inputs: string[] = [];
      const parts: string[] = [];
      let at = 0;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        parts.push(silence(l.start - at));
        if (who === "all" || l.speaker === who) {
          inputs.push("-i", path.join(work, `line-${String(i).padStart(2, "0")}.mp3`));
          parts.push(`[${inputs.length / 2 - 1}:a]aresample=48000,aformat=channel_layouts=stereo`);
        } else parts.push(silence(l.end - l.start));
        at = l.end;
      }
      parts.push(silence(total - at));
      const graph = `${parts.map((p, k) => `${p}[p${k}]`).join(";")};${parts.map((_, k) => `[p${k}]`).join("")}concat=n=${parts.length}:v=0:a=1[o]`;
      const out = path.join(work, `track-${who}.mp3`);
      await run(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[o]", "-b:a", "192k", out], { maxBuffer: 16 * 1024 * 1024 });
      const store = `podcast/${o.rowId}/track-${who}.mp3`;
      const { error } = await admin.storage.from("assets").upload(store, fs.readFileSync(out), { contentType: "audio/mpeg", upsert: true });
      if (error) throw new Error(`Couldn't store the voices: ${error.message}`);
      tracks[who] = admin.storage.from("assets").getPublicUrl(store).data.publicUrl;
    }

    const { data: cur } = await admin.from("generated_videos").select("metadata").eq("id", o.rowId).single();
    const meta = ((cur as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {});
    const desk = meta.desk as DeskRecord;
    await admin.from("generated_videos").update({ metadata: { ...meta, desk: { ...desk, total, lines, audio: tracks.all } } }).eq("id", o.rowId);

    // Two renders, then the charge once HeyGen has both.
    const hostJob = await submitLayer({ lookId: o.host.lookId, audioUrl: tracks.host, rowId: o.rowId, part: "host", title: o.title });
    const guestJob = await submitLayer({ lookId: o.guest.lookId, audioUrl: tracks.guest, rowId: o.rowId, part: "guest", title: o.title });
    await admin.rpc("podcast_desk_part", { row_id: o.rowId, part: "host", info: { job: hostJob } });
    await admin.rpc("podcast_desk_part", { row_id: o.rowId, part: "guest", info: { job: guestJob } });

    let source: string | null = null;
    if (!o.isAdmin) source = (await chargeOneVideo(admin, o.userId, "long"))?.source ?? null;
    const { data: now } = await admin.from("generated_videos").select("metadata").eq("id", o.rowId).single();
    await admin.from("generated_videos").update({
      render_job_id: hostJob,
      metadata: {
        ...((now as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}),
        credit_cost: o.isAdmin ? 0 : PODCAST_LONG_VIDEOS, credit_kind: "long", credit_source: source ?? "plan",
      },
    }).eq("id", o.rowId);
    await admin.from("api_usage_log").insert({ user_id: o.userId, api_provider: "heygen", endpoint: "podcast-desk", credits_used: PODCAST_LONG_VIDEOS, response_status: 202 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[podcast-desk] ${o.rowId} start failed:`, msg);
    await failEpisode(admin, o.rowId, `The episode couldn't be started. Nothing was charged. ${msg}`.slice(0, 300));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Step 2, from the webhook: one of the two renders reported back
 * (callback id "<row id>:host" or ":guest"). Returns the work to finish the
 * episode when this was the second one, else null.
 */
export async function deskPartDone(admin: Admin, callbackId: string, o: { success: boolean; videoUrl?: string; failure?: string }): Promise<Promise<void> | null> {
  const [rowId, part] = callbackId.split(":");
  if (!rowId || (part !== "host" && part !== "guest")) return null;
  if (!o.success || !o.videoUrl) {
    console.warn(`[podcast-desk] ${rowId} ${part} failed: ${o.failure ?? "no file"}`);
    await admin.rpc("podcast_desk_part", { row_id: rowId, part, info: { failed: o.failure ?? "no file" } });
    await failEpisode(admin, rowId, "The episode couldn't be made. Nothing was charged — please try again.");
    return null;
  }
  const { data } = await admin.rpc("podcast_desk_part", { row_id: rowId, part, info: { url: o.videoUrl } });
  const desk = data as DeskRecord | null;
  if (!desk?.parts?.host?.url || !desk.parts.guest?.url) return null;

  // Both in: claim the finishing so repeated deliveries don't do it twice.
  const { data: row } = await admin.from("generated_videos").select("metadata").eq("id", rowId).single();
  const meta = ((row as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {});
  const { data: claimed } = await admin.from("generated_videos")
    .update({ metadata: { ...meta, desk: { ...desk, composing_at: new Date().toISOString() } } })
    .eq("id", rowId).is("metadata->desk->>composing_at", null).select("id");
  if (!claimed?.length) return null;
  return finishDeskEpisode(admin, rowId);
}

const fmt = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23).replace(".", ",");
function captionsFor(lines: DeskLine[]): string {
  let n = 0;
  return lines.flatMap((l) => {
    const words = l.words.length ? l.words : l.text.split(/\s+/).map((w, i, a) => ({ word: w, start: ((l.end - l.start) * i) / a.length, end: ((l.end - l.start) * (i + 1)) / a.length }));
    const chunks: DeskWord[][] = [];
    for (let i = 0; i < words.length; i += 6) chunks.push(words.slice(i, i + 6));
    return chunks.map((c) => `${++n}\n${fmt(l.start + c[0].start)} --> ${fmt(l.start + c[c.length - 1].end)}\n${c.map((w) => w.word).join(" ")}`);
  }).join("\n\n");
}

/** Puts the shots together, stores the episode, and tells the agent (and gives the partner their copy). */
export async function finishDeskEpisode(admin: Admin, rowId: string): Promise<void> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "deskfin-"));
  const t0 = Date.now();
  try {
    const { data } = await admin.from("generated_videos").select("id, user_id, project_id, metadata").eq("id", rowId).single();
    const row = data as { id: string; user_id: string; project_id: string | null; metadata: Record<string, unknown> } | null;
    if (!row) return;
    const desk = row.metadata.desk as DeskRecord;
    if (!desk?.lines?.length || !desk.total || !desk.audio) throw new Error("The episode's voices are missing.");

    const get = async (url: string, name: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Couldn't download ${name} (${r.status}).`);
      const f = path.join(work, name);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      return f;
    };
    const setUrl = await studioSetUrl(admin, desk.setId);
    const deskUrl = await deskImageUrl(admin);
    const [setImage, hostLayer, guestLayer, audio] = await Promise.all([
      get(setUrl, "set.png"), get(desk.parts.host.url!, "host.webm"), get(desk.parts.guest.url!, "guest.webm"), get(desk.audio, "voices.mp3"),
    ]);
    let deskImage: string;
    if (deskUrl) deskImage = await get(deskUrl, "desk-art.png");
    else {
      // A plain walnut desk edge if the desk picture couldn't be made.
      deskImage = path.join(work, "desk-art.png");
      await run(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1280x720,format=rgba", "-vf",
        "geq=r='if(gt(Y,640),if(lt(Y,646),176,104-(Y-646)*0.35),0)':g='if(gt(Y,640),if(lt(Y,646),120,64-(Y-646)*0.25),0)':b='if(gt(Y,640),if(lt(Y,646),74,36-(Y-646)*0.15),0)':a='if(gt(Y,640),255,if(gt(Y,622),(Y-622)*7,0))'",
        "-frames:v", "1", deskImage]);
    }

    const out = await composeDesk({
      workDir: work, setImage, deskImage, hostLayer, guestLayer, audio,
      turns: desk.lines, total: desk.total, srt: captionsFor(desk.lines),
      guestScale: desk.guestScale, guestLift: desk.guestLift, threads: 1,
    });
    console.log(`[podcast-desk] ${rowId} put together in ${Math.round((Date.now() - t0) / 1000)}s`);

    const storePath = `${row.user_id}/${rowId}.mp4`;
    const { error } = await admin.storage.from("videos").upload(storePath, fs.readFileSync(out), { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Couldn't store the episode: ${error.message}`);
    const videoUrl = `${admin.storage.from("videos").getPublicUrl(storePath).data.publicUrl}?v=${Date.now()}`;
    await admin.from("generated_videos").update({
      render_status: "completed", video_url: videoUrl, render_finished_at: new Date().toISOString(),
      duration_seconds: Math.round(desk.total),
    }).eq("id", rowId);
    if (row.project_id) {
      await admin.from("projects").update({ status: "ready" }).eq("id", row.project_id);
      await ensureProjectThumbnail(row.project_id, row.user_id).catch(() => {});
    }
    await announceVideoReady(admin, rowId).catch(() => {});

    if (desk.partner?.partnerId) {
      await copyEpisodeToPartner(admin, {
        partnerId: desk.partner.partnerId, title: String(row.metadata.title ?? "Spark Podcast"), videoUrl,
        script: desk.lines.map((l) => l.text).join(" "), sourceRowId: rowId, hostName: desk.partner.hostName,
      }).catch((e) => console.error("[podcast-desk] partner copy failed:", e));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[podcast-desk] ${rowId} finish failed after ${Math.round((Date.now() - t0) / 1000)}s:`, msg);
    await failEpisode(admin, rowId, "The episode couldn't be put together. Nothing was charged — please try again.");
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
