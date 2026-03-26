import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recordingId, signedUrl } = await req.json();
  if (!recordingId || !signedUrl) {
    return NextResponse.json({ error: "recordingId and signedUrl are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Mark as transcribing
  await admin
    .from("voice_recordings")
    .update({ status: "transcribing" })
    .eq("id", recordingId)
    .eq("user_id", user.id);

  try {
    // Download the audio file from Supabase Storage signed URL
    const audioResponse = await fetch(signedUrl);
    if (!audioResponse.ok) throw new Error("Failed to fetch audio file");
    const audioBuffer = await audioResponse.arrayBuffer();

    // Prepare form data for ElevenLabs STT
    const formData = new FormData();
    formData.append(
      "audio",
      new Blob([audioBuffer], { type: "audio/webm" }),
      "recording.webm"
    );
    formData.append("model_id", "scribe_v1");
    formData.append("language_code", "en");
    formData.append("timestamps_granularity", "none");

    const elevenLabsResponse = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        },
        body: formData,
      }
    );

    if (!elevenLabsResponse.ok) {
      const errText = await elevenLabsResponse.text();
      throw new Error(`ElevenLabs STT error: ${errText}`);
    }

    const result = await elevenLabsResponse.json();
    const transcript: string = result.text || result.transcript || "";

    // Update recording with transcript
    await admin
      .from("voice_recordings")
      .update({ transcript, status: "transcribed" })
      .eq("id", recordingId)
      .eq("user_id", user.id);

    // Log API usage
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "elevenlabs",
      endpoint: "speech-to-text",
      credits_used: 1,
      response_status: 200,
    });

    return NextResponse.json({ transcript });
  } catch (err) {
    await admin
      .from("voice_recordings")
      .update({ status: "error" })
      .eq("id", recordingId)
      .eq("user_id", user.id);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
