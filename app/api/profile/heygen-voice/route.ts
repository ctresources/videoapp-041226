/**
 * POST /api/profile/heygen-voice
 *
 * Accepts the user's voice recording, uploads it to HeyGen as an asset,
 * creates a HeyGen voice clone (POST /v3/voices/clone), and saves the
 * resulting voice_id to the user's profile as heygen_voice_id.
 *
 * This is the sole voice-clone path — the user's cloned HeyGen voice drives
 * every AI video. (ElevenLabs is no longer used for voice cloning.)
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cloneVoice, deleteVoice } from "@/lib/api/heygen";
import { saveVoiceSample } from "@/lib/utils/voice-slot";
import { notifyVoiceCloneUnavailable } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

// Cloning uploads the sample then polls /v3/voices/{id} until the clone finishes.
export const maxDuration = 120;

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
      const msg = err instanceof Error ? err.message : "Voice clone failed";
      console.error("[heygen-voice] clone error:", msg);

      /**
       * Out of voice slots on OUR account — not a fault in their recording.
       *
       * The supplier's own words were handed straight to the agent: "Your plan
       * includes two voice clones. Upgrade to create more." On a new signup's
       * second screen that reads as THEIR plan being short, and invites them
       * to buy something that would not help — while naming a supplier this
       * app mentions nowhere else. One agent read it and recorded four samples
       * before giving up.
       *
       * Nothing they do can clear it, so they are told what is true for them:
       * the feature is off, their videos still work, the voice can come later.
       */
      if (/resource_limit_reached|voice clones|upgrade to create more/i.test(msg)) {
        notifyVoiceCloneUnavailable({ userEmail: user.email, detail: msg }).catch((e) =>
          console.error("[heygen-voice] owner notification failed:", e),
        );
        return NextResponse.json(
          {
            error: "Voice cloning isn't available on your account right now — there's nothing wrong with your recording. Your videos will use a natural stock voice, and you can add your own voice later.",
            code: "voice_cloning_unavailable",
          },
          { status: 503 },
        );
      }

      // Anything else is about this sample, and its own words are the most
      // useful thing we have — minus the supplier's name.
      return NextResponse.json(
        { error: msg.replace(/heygen/gi, "the voice service") },
        { status: 422 },
      );
    }

    /**
     * Keep the recording, not just the clone.
     *
     * Clone slots are an account-wide allowance, so a clone held by somebody
     * who is not rendering is capacity taken from somebody who is. Keeping the
     * sample is what lets the clone be given up later and rebuilt on demand —
     * without it, freeing a slot would mean asking this agent to record again.
     */
    const admin = createAdminClient();
    const samplePath = await saveVoiceSample(user.id, audioBuffer, contentType);

    await admin
      .from("profiles")
      .update({
        heygen_voice_id: voiceId,
        voice_clone_retired_at: null,
        ...(samplePath && {
          voice_sample_url: samplePath,
          voice_sample_at: new Date().toISOString(),
        }),
      })
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

    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("heygen_voice_id, voice_sample_url")
      .eq("id", user.id)
      .single();
    const row = data as { heygen_voice_id: string | null; voice_sample_url: string | null } | null;
    const voiceId = row?.heygen_voice_id ?? null;

    /**
     * Delete it THERE, not just here.
     *
     * This used to clear the column and stop, on the belief that no delete
     * endpoint existed. It does, and the consequence of not calling it was
     * seven abandoned clones holding an allowance of two — so the next agent
     * to record their voice was told the account was full.
     *
     * The column is cleared either way. A voice the service would not let go
     * of is still one this user has finished with, and leaving the id on the
     * profile would put a dead voice in their next video.
     */
    let removed = true;
    if (voiceId) {
      removed = await deleteVoice(voiceId);
      if (!removed) console.error(`[heygen-voice] slot not freed for ${user.id} (voice ${voiceId})`);
    }

    /**
     * The recording goes with it.
     *
     * Retiring a clone keeps the sample, because the voice is coming back.
     * "Remove" is the opposite request — the agent is withdrawing their voice
     * from the app — and keeping a recording of somebody's voice after they
     * asked for it to be gone is not a thing to do quietly. The Settings card
     * promises both are deleted; this is that promise.
     */
    if (row?.voice_sample_url) {
      const { error: sampleErr } = await admin.storage
        .from("voice-recordings")
        .remove([row.voice_sample_url]);
      if (sampleErr) console.error(`[heygen-voice] sample not deleted for ${user.id}: ${sampleErr.message}`);
    }

    await admin
      .from("profiles")
      .update({
        heygen_voice_id: null,
        voice_sample_url: null,
        voice_sample_at: null,
        voice_clone_retired_at: null,
      })
      .eq("id", user.id);

    return NextResponse.json({ ok: true, slotFreed: removed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove HeyGen voice" },
      { status: 500 },
    );
  }
}
