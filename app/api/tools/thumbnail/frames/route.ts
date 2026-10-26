import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

// Downloading a finished video and taking a few stills from it.
export const maxDuration = 120;

/** Runs ffmpeg. It reports on stderr, so that is what comes back. */
function runFfmpeg(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath.path, args);
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/**
 * POST /api/tools/thumbnail/frames — { projectId, count? }
 *
 * Stills spread evenly through the project's finished video, saved to storage,
 * for the thumbnail editor to offer as its background (2026-10-25). A frame
 * from the video is the thumbnail that is already true to it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, count } = (await req.json().catch(() => ({}))) as { projectId?: string; count?: number };
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  const shots = Math.min(8, Math.max(1, Math.round(count ?? 6)));

  const admin = createAdminClient();
  const { data: proj } = await admin.from("projects").select("user_id").eq("id", projectId).maybeSingle();
  if ((proj as { user_id: string } | null)?.user_id !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: vid } = await admin
    .from("generated_videos")
    .select("video_url")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("render_status", "completed")
    .not("video_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const videoUrl = (vid as { video_url: string | null } | null)?.video_url;
  if (!videoUrl) {
    return NextResponse.json({ error: "There's no finished video on this project yet." }, { status: 404 });
  }

  const dir = await mkdtemp(path.join(tmpdir(), "thumb-frames-"));
  try {
    const src = path.join(dir, "video.mp4");
    const res = await fetch(videoUrl);
    if (!res.ok) return NextResponse.json({ error: "Couldn't read the video." }, { status: 502 });
    await writeFile(src, Buffer.from(await res.arrayBuffer()));

    // ffmpeg with only an input exits non-zero, but its report names the length.
    const probe = await runFfmpeg(["-hide_banner", "-i", src]);
    const m = probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return NextResponse.json({ error: "Couldn't read the video's length." }, { status: 502 });
    const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);

    const stamp = Date.now();
    const frames: { url: string; seconds: number }[] = [];
    for (let i = 0; i < shots; i++) {
      const at = (seconds * (i + 0.5)) / shots;
      const out = path.join(dir, `frame-${i}.jpg`);
      const shot = await runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-y",
        "-ss", at.toFixed(2), "-i", src,
        "-frames:v", "1",
        // Fits inside 1280x720 without cropping; the renderer fills the frame.
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease",
        "-q:v", "3", out,
      ]);
      if (shot.code !== 0) continue;
      const bytes = await readFile(out);
      const storagePath = `thumbnails/${user.id}/frame_${stamp}_${i}.jpg`;
      const { error } = await admin.storage
        .from("assets")
        .upload(storagePath, bytes, { contentType: "image/jpeg", upsert: false });
      if (error) continue;
      frames.push({
        url: admin.storage.from("assets").getPublicUrl(storagePath).data.publicUrl,
        seconds: Math.round(at),
      });
    }

    if (frames.length === 0) {
      return NextResponse.json({ error: "Couldn't take a still from the video." }, { status: 502 });
    }
    return NextResponse.json({ frames });
  } catch (err) {
    console.error("[thumbnail frames] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't take stills from the video." }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
