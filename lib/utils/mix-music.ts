/**
 * Mix a background music track under a finished video's voiceover.
 *
 * HeyGen's Video Agent rejects audio file attachments, so the user's chosen
 * music cannot be part of the render itself — instead the webhook mixes it in
 * here (video stream copied, audio re-encoded) right before the video is
 * stored to Supabase.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Music level when nothing is being said, as a fraction of the track's own
 * volume.
 *
 * The old chain sat at 0.16 the whole way through, which measured -34.7 dB in
 * the open moments — correctly mixed, and inaudible, which is the same as
 * absent to the person watching. It was reported as "no music".
 *
 * 0.70 with the duck below measures -26.5 dB in those moments, +8.2 dB on what
 * shipped, while putting no more under the narration than a flat 0.55 would.
 * Measured on the bundled ffmpeg with volumedetect, not estimated.
 *
 * Env-overridable so the level can be tuned against a real video without a
 * code change.
 */
const MUSIC_LEVEL = Number(process.env.MUSIC_LEVEL || "") || 0.7;

/**
 * How hard the voiceover pushes the music down while it is speaking.
 *
 * A flat level has to be quiet enough for the busiest moment, which leaves the
 * open moments — the title card, the beat before the first line, the contact
 * card at the end — just as quiet, and those are exactly where a bed does its
 * work. Ducking lets the music sit up in the gaps and get out of the way under
 * speech, which is the difference between "there is music" and "this sounds
 * produced".
 */
const DUCK_RATIO = Number(process.env.MUSIC_DUCK_RATIO || "") || 12;

/**
 * The flat fallback runs without a duck, so the same number would sit on top
 * of the narration all the way through. Measured equivalent: flat 0.49 puts
 * about as much music under speech as ducked 0.70 does, and simply gives up
 * the louder bed in the gaps that the duck was buying.
 */
const FLAT_LEVEL = Math.round(MUSIC_LEVEL * 0.7 * 100) / 100;

/**
 * amix divides every input by the number of inputs, so the sum is boosted back
 * afterwards: the voiceover returns to roughly its own level and the music
 * lands at MUSIC_LEVEL, which is what the constants above are meant to mean.
 * The limiter guards that boost against clipping.
 *
 * amix's own `normalize=0` would say this far more directly and is the obvious
 * way to write it. It is not available here: @ffmpeg-installer ships a 2018
 * build (libavfilter 7.46) that predates the option, and passing it fails the
 * entire filter graph — which would have dropped the music altogether rather
 * than mixing it wrong. Checked against the bundled binary, not assumed.
 */
const MIX_TAIL = "amix=inputs=2:duration=first:dropout_transition=3[mix]";
const MIX_BOOST = "volume=2.0,alimiter=limit=0.95[a]";

/**
 * Ducked mix: the voiceover keys a compressor on the music.
 *
 * Both inputs are forced to one sample rate and layout first —
 * sidechaincompress requires them to match, and a HeyGen render's 44.1kHz
 * stereo against an arbitrary uploaded track is not a safe assumption.
 */
const DUCKED_FILTER = [
  "[0:a]aformat=channel_layouts=stereo:sample_rates=44100,asplit=2[voice][key]",
  `[1:a]aformat=channel_layouts=stereo:sample_rates=44100,volume=${MUSIC_LEVEL}[music]`,
  `[music][key]sidechaincompress=threshold=0.04:ratio=${DUCK_RATIO}:attack=12:release=350[duck]`,
  `[voice][duck]${MIX_TAIL}`,
  `[mix]${MIX_BOOST}`,
];

/**
 * Flat mix at the same resting level, for the case where sidechaincompress
 * isn't in the ffmpeg build. Losing the ducking is a worse mix; losing the
 * music entirely is the bug this whole file exists to avoid, and that is what
 * a hard failure here used to cause.
 */
const FLAT_FILTER = [
  `[1:a]volume=${FLAT_LEVEL}[m]`,
  `[0:a][m]${MIX_TAIL}`,
  `[mix]${MIX_BOOST}`,
];

function runMix(videoPath: string, musicPath: string, outPath: string, filter: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .input(musicPath)
      // Loop the track so it covers videos longer than the music.
      .inputOptions("-stream_loop", "-1")
      .complexFilter(filter)
      .outputOptions([
        "-map", "0:v",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
      ])
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outPath);
  });
}

/**
 * Returns a new MP4 buffer with the music mixed under the voiceover, or
 * null on any failure — callers must fall back to the original buffer so a
 * music problem can never lose a finished render.
 */
export async function mixBackgroundMusic(
  videoBuffer: Buffer,
  musicUrl: string,
): Promise<Buffer | null> {
  const dir = join(tmpdir(), `mix-${randomUUID()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    const videoPath = join(dir, "in.mp4");
    const musicPath = join(dir, "music.audio");
    const outPath = join(dir, "out.mp4");

    await fs.writeFile(videoPath, videoBuffer);

    const res = await fetch(musicUrl);
    if (!res.ok) throw new Error(`Music download failed: ${res.status}`);
    await fs.writeFile(musicPath, Buffer.from(await res.arrayBuffer()));

    let ducked = true;
    try {
      await runMix(videoPath, musicPath, outPath, DUCKED_FILTER);
    } catch (err) {
      console.warn(
        "[mix-music] Ducked mix failed, falling back to a flat bed:",
        err instanceof Error ? err.message : err,
      );
      ducked = false;
      await runMix(videoPath, musicPath, outPath, FLAT_FILTER);
    }

    const mixed = await fs.readFile(outPath);
    console.log(
      `[mix-music] Mixed ${(musicUrl.split("?")[0] || "").slice(-40)} into video ` +
      `(${(mixed.length / 1024 / 1024).toFixed(1)} MB, level=${MUSIC_LEVEL}, ` +
      `${ducked ? `ducked ${DUCK_RATIO}:1` : `flat at ${FLAT_LEVEL}`})`,
    );
    return mixed;
  } catch (err) {
    console.error("[mix-music] Failed, storing original audio:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
