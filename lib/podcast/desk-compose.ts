import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

const run = promisify(execFile);

/**
 * Spark Podcast at the desk (2026-11-02, the owner's pick from the prototype):
 * both people side by side on the studio set behind a desk, cutting to a
 * close-up of whoever is talking.
 *
 * HeyGen's API puts one person per scene and can't place them, so each person
 * is rendered once over their own full-length track (talking on their lines,
 * listening otherwise), see-through, and the shots are put together here.
 *
 * Each shot is made on its own and only from what's in it, then the pieces
 * are joined without re-encoding: the server has one processor, and making
 * three full-length shots to cut between (the prototype's way) was three
 * times the work.
 *
 * Imports are relative so the prototype scripts can run it directly.
 */

export interface DeskTurn { speaker: "host" | "guest"; start: number; end: number }
export type Shot = "wide" | "host" | "guest";

/** Wide to open and close, and every third line; otherwise whoever is talking. */
export function deskShots(turns: DeskTurn[]): Shot[] {
  return turns.map((t, i) => (i === 0 || i === turns.length - 1 || i % 3 === 0 ? "wide" : t.speaker));
}

export interface ComposeDesk {
  workDir: string;
  /** The studio set, any size (fitted to the frame). */
  setImage: string;
  /** The desk across the bottom: a see-through PNG the size of the frame. */
  deskImage: string;
  /** Each person, see-through VP9 WebM, 16:9, the person in the middle. */
  hostLayer: string;
  guestLayer: string;
  /** The combined voices, the whole episode. */
  audio: string;
  turns: DeskTurn[];
  total: number;
  /** Captions for the whole episode (SRT), burned per shot. */
  srt?: string | null;
  /**
   * A ready-made co-host is framed closer than a twin: shrink and lift theirs
   * to match the host. 1 / 0 for a partner's twin, framed like the host's.
   */
  guestScale?: number;
  guestLift?: number;
  width?: number;
  height?: number;
  /** One on the server. */
  threads?: number;
  /** Called after each shot, for progress and time checks. */
  onShot?: (done: number, of: number) => void;
}

const toSec = (t: string) => { const [h, m, s] = t.replace(",", ".").split(":"); return +h * 3600 + +m * 60 + +s; };
const fmt = (s: number) => new Date(Math.max(0, s) * 1000).toISOString().slice(11, 23).replace(".", ",");

/** The cues inside [from, to), moved to start at 0. */
function srtSlice(srt: string, from: number, to: number): string {
  const out: string[] = [];
  for (const block of srt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const tl = lines.findIndex((l) => l.includes("-->"));
    if (tl < 0) continue;
    const [a, z] = lines[tl].split(" --> ").map(toSec);
    if (z <= from || a >= to) continue;
    out.push(`${out.length + 1}\n${fmt(Math.max(a, from) - from)} --> ${fmt(Math.min(z, to) - from)}\n${lines.slice(tl + 1).join("\n")}`);
  }
  return out.join("\n\n");
}

export async function composeDesk(o: ComposeDesk): Promise<string> {
  const W = o.width ?? 1280, H = o.height ?? 720;
  const threads = String(o.threads ?? 1);
  const GS = o.guestScale ?? 0.8, LIFT = o.guestLift ?? 60;
  const ff = (args: string[]) => run(ffmpegPath.path, ["-y", "-hide_banner", "-loglevel", "error", ...args], { cwd: o.workDir, maxBuffer: 16 * 1024 * 1024 });

  // The set once, sharp for the wide shot and softened for close-ups.
  await ff(["-i", o.setImage, "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, "-frames:v", "1", "bg.png"]);
  await ff(["-i", "bg.png", "-vf", "boxblur=6:1", "-frames:v", "1", "bg-soft.png"]);
  await ff(["-i", o.deskImage, "-vf", `scale=${W}:${H},format=rgba`, "-frames:v", "1", "desk.png"]);

  const wideS = 0.8, closeS = 1.18;
  const wW = Math.round(W * wideS / 2) * 2, wH = Math.round(H * wideS / 2) * 2;
  const cW = Math.round(W * closeS / 2) * 2, cH = Math.round(H * closeS / 2) * 2;
  const gwW = Math.round(wW * GS / 2) * 2, gwH = Math.round(wH * GS / 2) * 2;
  const gcW = Math.round(cW * GS / 2) * 2, gcH = Math.round(cH * GS / 2) * 2;
  const lift = Math.round(LIFT * H / 720);
  const hostCloseY = H - cH + Math.round(100 * H / 720);

  const shots = deskShots(o.turns);
  const cuts = o.turns.map((t, i) => ({
    shot: shots[i],
    from: i === 0 ? 0 : Math.max(0, t.start - 0.12),
    to: i + 1 < o.turns.length ? Math.max(0, o.turns[i + 1].start - 0.12) : o.total,
  })).filter((c) => c.to - c.from > 0.04);

  const list: string[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const c = cuts[i];
    const dur = (c.to - c.from).toFixed(3);
    const seek = ["-ss", c.from.toFixed(3), "-t", dur];
    const layer = (f: string) => [...seek, "-c:v", "libvpx-vp9", "-i", f];
    const subs = o.srt ? srtSlice(o.srt, c.from, c.to) : "";
    if (subs) fs.writeFileSync(path.join(o.workDir, `s${i}.srt`), subs);
    const caption = subs
      ? `,subtitles=s${i}.srt:force_style='FontName=Arial,Fontsize=13,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H99000000,BorderStyle=4,Outline=2,Shadow=0,MarginV=14'`
      : "";
    let inputs: string[];
    let graph: string;
    if (c.shot === "wide") {
      inputs = ["-loop", "1", "-t", dur, "-i", "bg.png", ...layer(o.hostLayer), ...layer(o.guestLayer), "-loop", "1", "-t", dur, "-i", "desk.png"];
      graph = [
        `[1:v]scale=${wW}:${wH}[h]`, `[2:v]scale=${gwW}:${gwH}[g]`,
        `[0:v][h]overlay=${Math.round(W * 0.3 - wW / 2)}:${H - wH}[a]`,
        `[a][g]overlay=${Math.round(W * 0.7 - gwW / 2)}:${H - gwH - lift}[b]`,
        `[b][3:v]overlay=0:0${caption},fps=25,format=yuv420p[v]`,
      ].join(";");
    } else if (c.shot === "host") {
      inputs = ["-loop", "1", "-t", dur, "-i", "bg-soft.png", ...layer(o.hostLayer), "-loop", "1", "-t", dur, "-i", "desk.png"];
      graph = `[1:v]scale=${cW}:${cH}[h];[0:v][h]overlay=${Math.round((W - cW) / 2)}:${hostCloseY}[a];[a][2:v]overlay=0:0${caption},fps=25,format=yuv420p[v]`;
    } else {
      inputs = ["-loop", "1", "-t", dur, "-i", "bg-soft.png", ...layer(o.guestLayer), "-loop", "1", "-t", dur, "-i", "desk.png"];
      graph = `[1:v]scale=${gcW}:${gcH}[g];[0:v][g]overlay=${Math.round((W - gcW) / 2)}:${H - gcH - lift}[a];[a][2:v]overlay=0:0${caption},fps=25,format=yuv420p[v]`;
    }
    const seg = `seg${String(i).padStart(3, "0")}.mp4`;
    await ff(["-threads", threads, ...inputs, "-filter_complex_threads", threads, "-filter_complex", graph, "-map", "[v]", "-t", dur,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-threads", threads, "-an", seg]);
    list.push(`file '${seg}'`);
    o.onShot?.(i + 1, cuts.length);
  }

  fs.writeFileSync(path.join(o.workDir, "shots.txt"), list.join("\n"));
  await ff(["-f", "concat", "-safe", "0", "-i", "shots.txt", "-i", o.audio, "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "episode.mp4"]);
  return path.join(o.workDir, "episode.mp4");
}
