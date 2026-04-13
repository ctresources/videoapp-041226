import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Allow up to 60s for large WAV/MP3 uploads to ElevenLabs
export const maxDuration = 60;

// POST — upload audio to ElevenLabs, create voice clone, save voice_id to profile
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Could not parse upload. Please try again." }, { status: 400 });
    }

    const file = formData.get("audio") as File | null;
    const name = (formData.get("name") as string) || "My Cloned Voice";

    if (!file) return NextResponse.json({ error: "Audio file required" }, { status: 400 });

    const allowedExts = /\.(mp3|mp4|wav|webm|ogg|m4a|aac|flac)$/i;
    const allowedMimes = [
      "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/wave",
      "audio/webm", "audio/ogg", "audio/x-m4a", "audio/aac", "audio/flac",
      "audio/x-flac", "application/octet-stream",
    ];
    if (!allowedMimes.includes(file.type) && !allowedExts.test(file.name)) {
      return NextResponse.json({ error: "Unsupported format. Use MP3, WAV, M4A, or AAC." }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 50MB." }, { status: 400 });
    }

    if (file.size < 10_000) {
      return NextResponse.json({ error: "File too small. Please upload at least 30 seconds of audio." }, { status: 400 });
    }

    // Build multipart for ElevenLabs
    const elvFormData = new FormData();
    elvFormData.append("name", `${name} — ${user.id.slice(0, 8)}`);
    elvFormData.append("description", `Voice clone for ${user.email}`);
    elvFormData.append("files", file, file.name);

    let elvRes: Response;
    try {
      elvRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        body: elvFormData,
      });
    } catch (fetchErr) {
      console.error("ElevenLabs fetch error:", fetchErr);
      return NextResponse.json({ error: "Could not reach ElevenLabs. Check your internet connection." }, { status: 502 });
    }

    if (!elvRes.ok) {
      const errText = await elvRes.text().catch(() => "unknown error");
      console.error("ElevenLabs error:", elvRes.status, errText);

      // Try to parse a meaningful message from ElevenLabs JSON error
      let detail = "Ensure audio is 30s–5min, clear speech, no background music.";
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.detail?.message) detail = errJson.detail.message;
        else if (errJson?.detail) detail = String(errJson.detail);
      } catch { /* ignore */ }

      return NextResponse.json(
        { error: `Voice clone failed: ${detail}` },
        { status: 422 }
      );
    }

    let voiceData: { voice_id: string };
    try {
      voiceData = await elvRes.json();
    } catch {
      return NextResponse.json({ error: "Invalid response from ElevenLabs." }, { status: 502 });
    }

    const { voice_id } = voiceData;
    if (!voice_id) {
      return NextResponse.json({ error: "ElevenLabs did not return a voice ID." }, { status: 502 });
    }

    // Save to profile
    const admin = createAdminClient();
    await admin.from("profiles").update({ voice_clone_id: voice_id }).eq("id", user.id);

    return NextResponse.json({ voice_id, message: "Voice clone created!" });

  } catch (err) {
    console.error("Voice clone unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected server error. Please try again." },
      { status: 500 }
    );
  }
}

// DELETE — remove voice clone from ElevenLabs + clear from profile
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { voice_id } = await req.json() as { voice_id: string };

    if (voice_id) {
      await fetch(`https://api.elevenlabs.io/v1/voices/${voice_id}`, {
        method: "DELETE",
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      }).catch(() => {});
    }

    const admin = createAdminClient();
    await admin.from("profiles").update({ voice_clone_id: null }).eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Voice clone delete error:", err);
    return NextResponse.json({ error: "Failed to remove voice clone." }, { status: 500 });
  }
}
