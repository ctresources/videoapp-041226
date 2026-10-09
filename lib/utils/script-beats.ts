/**
 * A narration cut into the stretches a picture should change on.
 *
 * The background behind a talking head used to be a handful of clips played
 * for a fixed eight seconds each, in a loop. Even a well chosen clip then
 * landed under whichever sentence happened to be spoken when its turn came.
 * A caption file already says when every phrase is spoken, so the sentences
 * can be timed from it, and each given a picture of its own that is on screen
 * for exactly as long as it is being said.
 *
 * Pure and synchronous: text in, timings out. Nothing here knows about video.
 */
import { parseSrt } from "@/lib/utils/srt";

export interface Beat {
  /** The words spoken in this stretch. */
  text: string;
  /** Seconds from the start of the video. A beat ends where the next begins. */
  start: number;
  end: number;
}

/** "00:01:02,500" to seconds. */
function seconds(stamp: string): number {
  const m = stamp.match(/^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

/**
 * @param minSeconds a sentence shorter than this shares a picture with its
 *   neighbour. "Stay visible. Build trust." is two sentences and one thought,
 *   and a picture that is gone in a second and a half is a flicker.
 * @param maxBeats the most pictures one video gets. Past it the shortest
 *   neighbours are joined, so a long script gets a picture per section.
 */
export function beatsFromSrt(srt: string, minSeconds = 4, maxBeats = 12): Beat[] {
  // Every word with a time. A cue only times its first and last word, so the
  // ones between are spread evenly across it, which is near enough for a cut.
  const words: { w: string; at: number; until: number }[] = [];
  for (const cue of parseSrt(srt)) {
    const from = seconds(cue.start);
    const to = Math.max(from, seconds(cue.end));
    const parts = cue.text.split(/\s+/).filter(Boolean);
    parts.forEach((w, i) => {
      words.push({
        w,
        at: from + ((to - from) * i) / parts.length,
        until: from + ((to - from) * (i + 1)) / parts.length,
      });
    });
  }
  if (words.length === 0) return [];

  // Sentences. A word that ends one is followed by a break; "SparkReels.ai"
  // has its dot inside the word and is not one.
  const sentences: Beat[] = [];
  let open: typeof words = [];
  const close = () => {
    if (open.length === 0) return;
    sentences.push({ text: open.map((x) => x.w).join(" "), start: open[0].at, end: open[open.length - 1].until });
    open = [];
  };
  for (const word of words) {
    open.push(word);
    if (/[.!?]["')\]]*$/.test(word.w)) close();
  }
  close();

  const join = (a: Beat, b: Beat): Beat => ({ text: `${a.text} ${b.text}`, start: a.start, end: b.end });

  // Short ones take the sentence after them, until there is enough to look at.
  let beats: Beat[] = [];
  for (const s of sentences) {
    const last = beats[beats.length - 1];
    if (last && last.end - last.start < minSeconds) beats[beats.length - 1] = join(last, s);
    else beats.push(s);
  }
  // A short one left at the very end goes back onto the one before it.
  if (beats.length > 1) {
    const tail = beats[beats.length - 1];
    if (tail.end - tail.start < minSeconds) {
      beats = [...beats.slice(0, -2), join(beats[beats.length - 2], tail)];
    }
  }

  // Too many: join the two neighbours that together are shortest, and again.
  while (beats.length > maxBeats) {
    let at = 0;
    let least = Infinity;
    for (let i = 0; i < beats.length - 1; i++) {
      const span = beats[i + 1].end - beats[i].start;
      if (span < least) { least = span; at = i; }
    }
    beats = [...beats.slice(0, at), join(beats[at], beats[at + 1]), ...beats.slice(at + 2)];
  }

  // One unbroken run from zero: a pause belongs to the picture before it,
  // and the first picture is up before the first word.
  return beats.map((b, i) => ({
    text: b.text,
    start: i === 0 ? 0 : b.start,
    end: i < beats.length - 1 ? beats[i + 1].start : b.end,
  }));
}
