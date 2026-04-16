/**
 * POST /api/profile/heygen-voice
 *
 * Accepts a voice recording (same audio as ElevenLabs clone), uploads it to
 * HeyGen as an asset, creates a HeyGen voice clone, and saves the voice_id
 * to the user's profile as heygen_voice_id.
 *
 * Called in parallel with /api/profile/voice-clone (ElevenLabs) so both
 * systems get the voice in a single settings action.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloneVoice } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.HEYGEN_API_KEY) {
      return NextResponse.json(
        { error: "HeyGen API key not configured." },
        { status: 503 },
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Could not parse upload." }, { status: 400 });
    }

    const file = formData.get("audio") as File | null;
    const name = (formData.get("name") as string) || "My Voice";

    if (!file) return NextResponse.json({ error: "Audio file required" }, { status: 400 });
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 50MB." }, { status: 400 });
    }
    if (file.size < 10_000) {
      return NextResponse.json({ error: "Recording too short." }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await file.arrayBuffer());

    // Normalise MIME type — browsers record as audio/webm but HeyGen accepts common audio formats
    const contentType =
      file.type && file.type !== "application/octet-stream"
        ? file.type
        : "audio/mpeg";

    let voiceId: string;
    try {
      voiceId = await cloneVoice(audioBuffer, `${name} — ${user.id.slice(0, 8)}`, contentType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "HeyGen voice clone failed";
      console.error("[heygen-voice] clone error:", msg);
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    // Save to profile
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ heygen_voice_id: voiceId })
      .eq("id", user.id);

    console.log(`[heygen-voice] Saved voice ${voiceId} for user ${user.id}`);
    return NextResponse.json({ voice_id: voiceId });

  } catch (err) {
    console.error("[heygen-voice] unexpected error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // HeyGen doesn't expose a voice delete endpoint in v3 yet — just clear from profile
    const admin = createAdminClient();
    await admin
      .from("profiles")
      .update({ heygen_voice_id: null })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove HeyGen voice" },
      { status: 500 },
    );
  }
}
