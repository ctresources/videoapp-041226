/**
 * GET /api/video/test-render
 * Diagnostic endpoint — tests each step of the HeyGen video pipeline.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSpeech } from "@/lib/api/elevenlabs";
import { searchStockVideos } from "@/lib/api/stock-video";
import { getVideoStatus } from "@/lib/api/heygen";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const results: Record<string, string> = {};

  // ── 1. Check env vars ──────────────────────────────────────────────────────
  results["env_elevenlabs"] = process.env.ELEVENLABS_API_KEY ? "✅ Set" : "❌ Missing";
  results["env_heygen"] = process.env.HEYGEN_API_KEY ? "✅ Set" : "❌ Missing";
  results["env_pixabay"] = process.env.PIXABAY_API_KEY ? "✅ Set" : "❌ Missing";
  results["env_perplexity"] = process.env.PERPLEXITY_API_KEY ? "✅ Set" : "❌ Missing";
  results["env_supabase"] = process.env.SUPABASE_SERVICE_ROLE_KEY ? "✅ Set" : "❌ Missing";

  // ── 2. ElevenLabs TTS ─────────────────────────────────────────────────────
  try {
    const audio = await generateSpeech("Testing the video pipeline. One two three.");
    results["step1_elevenlabs"] = `✅ OK — ${audio.length} bytes`;
  } catch (e) {
    results["step1_elevenlabs"] = `❌ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // ── 3. Supabase storage ────────────────────────────────────────────────────
  try {
    const admin = createAdminClient();
    const path = `audio/test/pipeline-test-${Date.now()}.mp3`;
    const { error } = await admin.storage
      .from("assets")
      .upload(path, Buffer.from("test"), { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error(error.message);
    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);
    results["step2_supabase"] = `✅ OK — ${publicUrl.slice(0, 80)}...`;
    await admin.storage.from("assets").remove([path]);
  } catch (e) {
    results["step2_supabase"] = `❌ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // ── 4. Pixabay stock video search ──────────────────────────────────────────
  try {
    const clips = await searchStockVideos(["real estate home exterior"], "landscape", 1);
    results["step3_pixabay"] = clips.length > 0
      ? `✅ OK — ${clips.length} clip(s)`
      : "⚠️ No clips found";
  } catch (e) {
    results["step3_pixabay"] = `❌ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // ── 5. HeyGen API connectivity ────────────────────────────────────────────
  try {
    // Use a dummy video ID — should get 404, confirming API connectivity
    await getVideoStatus("test-connectivity-check").catch((err) => {
      if (err.message.includes("404") || err.message.includes("not found")) {
        return; // 404 = API is reachable, just no video with that ID
      }
      throw err;
    });
    results["step4_heygen"] = "✅ OK — API reachable";
  } catch (e) {
    results["step4_heygen"] = `❌ FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  return NextResponse.json({
    pipeline: "Perplexity → ElevenLabs → Pixabay → HeyGen Studio API",
    max_video_duration: "3 minutes",
    timestamp: new Date().toISOString(),
    results,
  });
}
