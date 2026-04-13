import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  const title = (formData.get("title") as string) || "Untitled Recording";
  const durationStr = formData.get("duration") as string | null;

  if (!file) return NextResponse.json({ error: "No audio file provided" }, { status: 400 });

  const ext = file.name.split(".").pop() || "webm";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const admin = createAdminClient();

  // Upload to Supabase Storage
  const { error: uploadError } = await admin.storage
    .from("voice-recordings")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get signed URL (private bucket)
  const { data: urlData } = await admin.storage
    .from("voice-recordings")
    .createSignedUrl(path, 60 * 60 * 24); // 24-hour signed URL for transcription

  // Insert recording row
  const { data: recording, error: dbError } = await admin
    .from("voice_recordings")
    .insert({
      user_id: user.id,
      title,
      audio_url: path,
      duration_seconds: durationStr ? parseInt(durationStr) : null,
      status: "uploaded",
    })
    .select()
    .single();

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({
    recording,
    signedUrl: urlData?.signedUrl,
  });
}
