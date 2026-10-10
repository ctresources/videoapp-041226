/**
 * A longer script read in the agent's own voice, in parts.
 *
 * The first Scenes reel made on the live site was read by a stock voice. The
 * agent had a voice clone; the request for fifty seconds of speech simply had
 * not come back inside a minute, and the reel fell through to the fallback.
 * Speech is made at roughly the pace it is spoken, so one request for a
 * ninety second script cannot be relied on to return in time.
 *
 * So the script is cut at sentence ends into pieces of about twenty seconds,
 * the pieces are spoken at the same time, and the audio is joined in order.
 * A sentence end is where a speaker pauses anyway, which is why the joins are
 * put there. Each word's time is moved along by the length of what came
 * before it, so captions and scene cuts still land on the words.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { speakInVoice } from "@/lib/api/heygen";
import { audioBufferSeconds } from "@/lib/api/ffmpeg-render";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/** About twenty seconds of speech. */
const WORDS_PER_PART = 50;
/** A script this short is one request, as it always was. */
const ONE_PART_WORDS = 60;
const AT_ONCE = 3;

type Spoken = { audioBuffer: Buffer; wordTimestamps: { word: string; start: number; end: number }[] };

/** Sentences gathered into parts of about WORDS_PER_PART, never split inside one. */
export function speechParts(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) ?? [text];
  const parts: string[] = [];
  let open = "";
  let count = 0;
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const n = s.split(/\s+/).length;
    if (open && count + n > WORDS_PER_PART) {
      parts.push(open);
      open = "";
      count = 0;
    }
    open = open ? `${open} ${s}` : s;
    count += n;
  }
  if (open) parts.push(open);
  return parts;
}

async function speakWithRetry(text: string, voiceId: string): Promise<Spoken> {
  try {
    return await speakInVoice(text, voiceId, 75_000);
  } catch (first) {
    console.warn("[long-speech] one part failed, trying it once more:", first instanceof Error ? first.message : first);
    return await speakInVoice(text, voiceId, 75_000);
  }
}

/** Throws on failure, like speakInVoice, so the caller can fall back and say that it did. */
export async function speakLongInVoice(text: string, voiceId: string): Promise<Spoken> {
  const clean = text.trim();
  if (clean.split(/\s+/).length <= ONE_PART_WORDS) return speakWithRetry(clean, voiceId);

  const parts = speechParts(clean);
  if (parts.length < 2) return speakWithRetry(clean, voiceId);

  const started = Date.now();
  const spoken: Spoken[] = new Array(parts.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, parts.length) }, async () => {
    while (next < parts.length) {
      const i = next++;
      spoken[i] = await speakWithRetry(parts[i], voiceId);
    }
  }));

  const dir = join(tmpdir(), `speech-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const paths: string[] = [];
    const words: Spoken["wordTimestamps"] = [];
    let at = 0;
    for (let i = 0; i < spoken.length; i++) {
      const p = join(dir, `part${i}.bin`);
      await fs.writeFile(p, spoken[i].audioBuffer);
      paths.push(p);
      for (const w of spoken[i].wordTimestamps) words.push({ word: w.word, start: w.start + at, end: w.end + at });
      at += await audioBufferSeconds(spoken[i].audioBuffer);
    }
    const out = join(dir, "joined.mp3");
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      paths.forEach((p) => cmd.input(p));
      cmd
        .complexFilter(`${paths.map((_, i) => `[${i}:a]`).join("")}concat=n=${paths.length}:v=0:a=1[a]`)
        .outputOptions(["-map [a]", "-c:a libmp3lame", "-b:a 192k", "-ar 44100"])
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .save(out);
    });
    console.log(`[long-speech] ${parts.length} parts, ${at.toFixed(1)}s of speech, in ${Math.round((Date.now() - started) / 1000)}s`);
    return { audioBuffer: await fs.readFile(out), wordTimestamps: words };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
