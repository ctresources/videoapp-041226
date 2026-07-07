import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const { ext } = (await req.json()) as { ext?: string };
  const safeExt = ext === "mp4" ? "mp4" : "webm";
  const path = `camera-recordings/${user.id}/${Date.now()}.${safeExt}`;

  const admin = createAdminClient();
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
