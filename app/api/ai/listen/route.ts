import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { speakLongInVoice } from "@/lib/api/long-speech";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** About 2,500 words: a long blog article, with room to spare. */
const MAX_CHARS = 16_000;

/**
 * POST /api/ai/listen — a script or article read aloud in the agent's own
 * cloned voice (2026-10-21, the owner's ask). { text } → { url } of an MP3.
 *
 * Saved by a hash of the voice and the words, so listening again is instant
 * and costs nothing; an edit makes it fresh. With no voice clone it answers
 * { fallback: true }, and the page reads it in the browser's own voice.
 * HeyGen bills about $15–30 per million characters: a few cents a script.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const words = (text ?? "").trim().slice(0, MAX_CHARS);
  if (!words) return NextResponse.json({ error: "Nothing to read yet." }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("heygen_voice_id").eq("id", user.id).single();
  const voiceId = (profile as { heygen_voice_id: string | null } | null)?.heygen_voice_id;
  if (!voiceId) return NextResponse.json({ fallback: true });

  const hash = createHash("sha256").update(`${voiceId}\n${words}`).digest("hex").slice(0, 32);
  const path = `${user.id}/listen/${hash}.mp3`;
  const publicUrl = admin.storage.from("assets").getPublicUrl(path).data.publicUrl;

  // Already made for these words in this voice: hand it straight back.
  const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
  if (head?.ok) return NextResponse.json({ url: publicUrl });

  try {
    const spoken = await speakLongInVoice(words, voiceId, 8);
    const { error } = await admin.storage
      .from("assets")
      .upload(path, spoken.audioBuffer, { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(error.message);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "listen",
      credits_used: 0,
      response_status: 200,
    });
    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("[listen]", err instanceof Error ? err.message : err);
    // The browser's voice still works; better than nothing.
    return NextResponse.json({ fallback: true, error: "Your voice isn't available just now." });
  }
}
