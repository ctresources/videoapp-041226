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

export interface SrtCue {
  /** Kept as the original "00:00:03,500" strings rather than parsed to
   *  seconds: an edit only ever changes the words, and a round trip through
   *  floating point would nudge every timestamp in the file for no reason. */
  start: string;
  end: string;
  text: string;
}

const SRT_TIME_LINE = /^(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/;

/**
 * Read an SRT back into cues, so a transcript can be shown and corrected.
 *
 * Tolerant on purpose — it finds the timing line rather than assuming the
 * counter above it is present or correct, and folds a cue's wrapped lines into
 * one string. Blocks it cannot make sense of are skipped rather than throwing:
 * a single malformed cue should cost that cue, not the whole transcript.
 */
export function parseSrt(srt: string): SrtCue[] {
  const cues: SrtCue[] = [];
  for (const block of srt.replace(/\r\n/g, "\n").trim().split(/\n{2,}/)) {
    const lines = block.split("\n");
    const at = lines.findIndex((l) => SRT_TIME_LINE.test(l));
    if (at === -1) continue;
    const [, start, end] = lines[at].match(SRT_TIME_LINE)!;
    const text = lines.slice(at + 1).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    cues.push({ start, end, text });
  }
  return cues;
}

/**
 * Cues back to an SRT file.
 *
 * Emptied cues are dropped and the counter is rebuilt from scratch, which is
 * what makes clearing a line a way to delete it — the alternative is a file
 * with gaps in its numbering that some players refuse outright.
 */
export function serializeSrt(cues: SrtCue[]): string {
  return cues
    .filter((c) => c.text.trim())
    .map((c, i) => `${i + 1}\n${c.start} --> ${c.end}\n${c.text.trim()}\n`)
    .join("\n");
}

/** The words on their own, for the places that want prose rather than timing —
 *  the description, and the script stored with the project. */
export function srtToPlainText(cues: SrtCue[]): string {
  return cues.map((c) => c.text.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
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

/**
 * Word timings for audio someone recorded, rather than audio we synthesised.
 *
 * Text-to-speech hands back timings with the audio, because it decided when
 * every word happened. A recording of a person has no such record, so the only
 * way to caption one is to listen to it — the same ElevenLabs pass that builds
 * a .srt, stopping one step earlier at the words themselves.
 *
 * Returns an empty array rather than throwing when there is no speech: a
 * silent take is a normal thing to have recorded, and it should cost the
 * captions rather than the video.
 */
export async function transcribeToWords(
  media: Buffer | ArrayBuffer,
  contentType = "audio/webm",
): Promise<{ word: string; start: number; end: number }[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const bytes = media instanceof Buffer ? new Uint8Array(media) : new Uint8Array(media);
  const formData = new FormData();
  formData.append("file", new Blob([bytes], { type: contentType }), "voiceover.webm");
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
  return ((result.words || []) as SttWord[])
    .filter((w) => (w.type ?? "word") === "word" && typeof w.start === "number")
    .map((w) => ({ word: w.text, start: w.start, end: w.end }));
}
