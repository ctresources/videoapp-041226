import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 15;

/**
 * POST /api/video/camera-upload-url
 * Issues a signed upload URL so the browser can upload a camera recording
 * directly to Supabase Storage. Long recordings (100 MB+) exceed the
 * serverless request-body limit, so the file must never pass through
 * this server — only the signed token does.
 * Body: { ext: "webm" | "mp4" }
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

  // A retry writes to a path that may already hold the previous attempt's
  // bytes, and a signed upload URL will not overwrite. Removing first makes
  // the retry a clean replacement instead of a failure. Best effort: nothing
  // there is the normal case.
  if (safeKey) {
    await admin.storage.from("assets").remove([path]).catch(() => {});
  }

  const { data, error } = await admin.storage
    .from("assets")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: data.path, token: data.token });
}
