/**
 * SRT captions — building them from word timestamps, and getting word
 * timestamps out of a finished video.
 *
 * Two callers, one source of truth:
 *   - /api/video/captions serves a .srt the user attaches in YouTube Studio.
 *   - store-video burns captions into the render when HeyGen hands us no
 *     sidecar SRT of its own, which is every Video Agent render.
 */

export interface SttWord {
  text: string;
  start: number;
  end: number;
  type?: string;
}

export function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rem = ms % 1000;
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rem, 3)}`;
}

/** Group word timestamps into SRT cues — max 7 words or 3.5s per cue. */
export function buildSrt(words: SttWord[]): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let current: SttWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
  };

  for (const w of words) {
    current.push(w);
    const spanTooLong = current[current.length - 1].end - current[0].start >= 3.5;
    const sentenceEnd = /[.!?]$/.test(w.text);
    if (current.length >= 7 || spanTooLong || sentenceEnd) flush();
  }
  flush();

  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}

/**
 * Transcribe a video's audio to an SRT with ElevenLabs STT (word-level
 * timestamps). Returns null when the clip has no speech; throws if the API
 * call itself fails, so callers can tell "nothing to caption" from "the
 * transcription broke".
 */
export async function transcribeToSrt(
  media: Buffer | ArrayBuffer,
  contentType = "video/mp4",
): Promise<string | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const bytes = media instanceof Buffer ? new Uint8Array(media) : new Uint8Array(media);

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([bytes], { type: contentType }),
    contentType.includes("webm") ? "video.webm" : "video.mp4",
  );
  formData.append("model_id", "scribe_v1");
  formData.append("language_code", "en");
  formData.append("timestamps_granularity", "word");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Transcription failed (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }

  const result = await res.json();
  const words: SttWord[] = (result.words || [])
    .filter((w: SttWord) => (w.type ?? "word") === "word" && typeof w.start === "number")
    .map((w: SttWord) => ({ text: w.text, start: w.start, end: w.end }));

  if (words.length === 0) return null;
  return buildSrt(words);
}
