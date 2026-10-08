/**
 * Scenes joined into one silent clip, for the camera recorder to play behind
 * the speaker. Its own file so it can be run outside a route.
 */
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { promises as fs } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { SCENES_MIN } from "@/lib/api/scene-clips";

ffmpeg.setFfmpegPath(ffmpegPath.path);

/** The clips, one after another, silent, at one size. */
export async function joinSceneClips(urls: string[], w: number, h: number): Promise<Buffer> {
  const dir = join(tmpdir(), `scene-footage-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    const paths: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(urls[i], { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) continue;
      const p = join(dir, `s${i}.mp4`);
      await fs.writeFile(p, Buffer.from(await res.arrayBuffer()));
      paths.push(p);
    }
    if (paths.length < SCENES_MIN) throw new Error("The scenes could not be fetched.");
    const out = join(dir, "out.mp4");
    const fit = paths
      .map((_, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,setsar=1[v${i}]`)
      .join(";");
    const chain = `${fit};${paths.map((_, i) => `[v${i}]`).join("")}concat=n=${paths.length}:v=1:a=0[v]`;
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg();
      paths.forEach((p) => cmd.input(p));
      cmd
        .complexFilter(chain)
        .outputOptions(["-map [v]", "-an", "-c:v libx264", "-preset veryfast", "-crf 26", "-pix_fmt yuv420p", "-movflags +faststart"])
        .on("end", () => resolve())
        .on("error", (e) => reject(e))
        .save(out);
    });
    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
