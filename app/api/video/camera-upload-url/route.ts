import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

/**
 * The storage path a saved video's public URL points at.
 *
 * The row is the only record of where a recording actually lives, so checking
 * whether it is still backed by a file means asking the URL it references —
 * not recomputing a path and hoping the two agree. The cache-buster query the
 * faststart repair appends is stripped.
 */
function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/object/public/assets/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const rest = url.slice(i + marker.length).split("?")[0];
  try {
    return decodeURIComponent(rest) || null;
  } catch {
    return rest || null;
  }
}

/**
 * POST /api/video/camera-upload-url
 * Issues a signed upload URL so the browser can upload a camera recording
 * directly to Supabase Storage. Long recordings (100 MB+) exceed the
 * serverless request-body limit, so the file must never pass through
 * this server — only the signed token does.
 * Body: { ext: "webm" | "mp4", key?: recovery id }
 *
 * Idempotency-aware, because it is also the first thing a retry calls. A
 * recording whose save already succeeded is answered with its video id and
 * nothing in storage is touched.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Checked here too, not just at save time — otherwise a trial-expired
  // user would upload the whole recording (sometimes 100+ MB) before
  // finding out it can't be saved.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const admin = createAdminClient();
  const { ext, key } = (await req.json()) as { ext?: string; key?: string };
  const safeExt = ext === "mp4" ? "mp4" : "webm";

  /**
   * The path is derived from the recording's recovery id, not the clock.
   *
   * A recording kept on the device after a failed upload is retried with the
   * same id, and a timestamped path gave each attempt its own object — so a
   * take that failed twice left two abandoned files in storage paid for by
   * nobody. Same recording, same path.
   *
   * Sanitised rather than trusted: this becomes a storage key, and the save
   * route only accepts paths inside this user's own folder.
   */
  const safeKey = (key || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  const path = `camera-recordings/${user.id}/${safeKey || Date.now()}.${safeExt}`;

  /** Whether a file is really there, asked of storage rather than assumed. */
  async function objectExists(fullPath: string): Promise<boolean> {
    const slash = fullPath.lastIndexOf("/");
    const dir = slash === -1 ? "" : fullPath.slice(0, slash);
    const name = slash === -1 ? fullPath : fullPath.slice(slash + 1);
    const { data, error } = await admin.storage
      .from("assets")
      .list(dir, { search: name, limit: 100 });
    if (error || !data) return false;
    // `search` is a prefix match, so the name still has to match exactly.
    return data.some((o) => o.name === name);
  }

  let uploadPath = path;

  if (safeKey) {
    /**
     * Has this recording already been saved?
     *
     * Asked BEFORE anything is deleted, and that order is the whole point.
     * This route used to clear the deterministic path on every retry, then let
     * the save route discover the recording was already saved. If the retry's
     * upload then failed — the same bad connection that caused the retry — the
     * file was gone for good while a completed row in My Content still pointed
     * at it. The recovery mechanism was the thing breaking the video.
     */
    const { data: existing } = await admin
      .from("generated_videos")
      .select("id, project_id, video_url, render_status")
      .eq("user_id", user.id)
      .eq("idempotency_key", safeKey)
      .maybeSingle();

    const row = existing as {
      id: string; project_id: string; video_url: string | null; render_status: string;
    } | null;

    if (row && row.render_status === "completed") {
      const referenced = row.video_url ? storagePathFromPublicUrl(row.video_url) : null;
      // "Saved" means the row AND the file it names. A row whose object has
      // gone is not a finished video, and reporting it as one would strand the
      // only remaining copy — the one on the device asking this question.
      if (referenced && await objectExists(referenced)) {
        return NextResponse.json({
          alreadySaved: true,
          videoId: row.id,
          projectId: row.project_id,
        });
      }
      // The row is real but its file is missing. Send the caller back to
      // exactly where the row points, so the repair lands under the same video
      // id rather than creating a second one.
      if (referenced) uploadPath = referenced;
    }
  }

  /**
   * Overwrite in place. Nothing is ever deleted here.
   *
   * This route used to clear the deterministic path before signing, because a
   * signed upload URL will not overwrite by default. That left a window with
   * no usable copy on the server, and two retries racing could each delete the
   * other's upload — both would see no completed row, and both would clear the
   * path the other was mid-way through writing.
   *
   * Upsert removes the window rather than guarding it. Storage replaces the
   * object only when a write completes, so simultaneous retries of the same
   * recording write the same bytes to the same path and the last one wins.
   * Cleanup is not something this route does at all: the old object is
   * replaced by its own replacement, and only on success.
   *
   * It has to be asked for here — `uploadToSignedUrl` ignores `upsert`, which
   * is decided when the token is minted.
   */
  const { data, error } = await admin.storage
    .from("assets")
    .createSignedUploadUrl(uploadPath, { upsert: true });

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
