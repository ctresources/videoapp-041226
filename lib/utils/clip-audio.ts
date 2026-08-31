/**
 * Pulling a clip's speech out as a small audio file, in the browser.
 *
 * The point is what it avoids. Transcribing an uploaded clip the obvious way
 * means posting the video somewhere, and a walkthrough is hundreds of
 * megabytes — far past a serverless request body, which is the whole reason
 * the scope doc had "widen the upload endpoint" as a prerequisite. Decoding
 * the audio here and sending only that turns a 300 MB video into about three
 * megabytes of speech, which fits anywhere.
 *
 * Mono, 16 kHz, 16-bit. Speech recognition gains nothing from stereo or from
 * anything above 16 kHz, and every one of those doublings is size for no
 * accuracy.
 */

const TARGET_RATE = 16000;

/** Decoding is native but not universal — a phone-shot HEVC MP4 can decode
 *  its video fine and refuse its audio. Callers offer typing instead. */
export class ClipAudioUnavailable extends Error {}

/**
 * Decode, downmix and resample a media file to a WAV blob of its speech.
 *
 * Faster than real time: this reads the file rather than playing it, so a
 * two-minute walkthrough is a second or two rather than two minutes.
 */
export async function extractSpeechWav(file: Blob, maxSeconds = 900): Promise<Blob> {
  const Ctx: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new ClipAudioUnavailable("This browser cannot decode audio.");

  const bytes = await file.arrayBuffer();

  // Decoded at the device's own rate first. Asking a context to decode
  // straight to 16 kHz is not portable — some browsers ignore the rate and
  // hand back the file's own, which would then be played at the wrong speed.
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    throw new ClipAudioUnavailable("This browser couldn't read the audio in that file.");
  } finally {
    void ctx.close().catch(() => {});
  }

  if (!decoded.length) throw new ClipAudioUnavailable("That file has no audio track.");

  const seconds = Math.min(decoded.duration, maxSeconds);
  const frames = Math.ceil(seconds * TARGET_RATE);
  // Rendering through a mono 16 kHz context is what does the downmix and the
  // resample — both in one pass, both by the browser's own resampler.
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();

  return encodeWav(rendered.getChannelData(0), TARGET_RATE);
}

/** 16-bit PCM WAV. Written by hand because the alternative is shipping an
 *  encoder to produce the simplest container there is. Exported so the header
 *  arithmetic can be tested without a browser — a wrong byte rate here is a
 *  file that plays at the wrong speed and transcribes to nonsense. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);          // PCM header size
  view.setUint16(20, 1, true);           // format: PCM
  view.setUint16(22, 1, true);           // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate (mono, 2 bytes/sample)
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let at = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling: a sample past ±1 would wrap to the opposite
    // extreme and read as a click rather than as clipping.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    at += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}
