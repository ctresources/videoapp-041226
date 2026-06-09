import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 20MB" }, { status: 413 });
  }
  const contentType = file.type || "image/jpeg";
  if (!ALLOWED_TYPES.some((t) => contentType.startsWith(t.split("/")[0]) && contentType.includes(t.split("/")[1]))) {
    return NextResponse.json({ error: "Only image files are supported (JPEG, PNG, WebP, GIF, HEIC)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `video-photos/${user.id}/${Date.now()}-${safeName}`;

  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, buffer, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, name: file.name });
}
