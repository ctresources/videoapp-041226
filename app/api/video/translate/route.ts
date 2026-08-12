import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createVideoTranslation,
  getSupportedTranslationLanguages,
} from "@/lib/api/heygen";
import { buildCallbackUrl } from "@/lib/utils/webhook-callback";
import { chargeFor, type VideoKind } from "@/lib/utils/video-allowance";
import { NextRequest, NextResponse } from "next/server";

// GET — the language picker's options, resolved from HeyGen rather than
// hardcoded (see getSupportedTranslationLanguages for why).
export async function GET() {
  try {
    const languages = await getSupportedTranslationLanguages();
    return NextResponse.json({ languages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not load languages";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// POST — dub a completed video into another language. Charges the same
// allowance kind (short/long) the source video was charged, since HeyGen
// bills a translation as its own render.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, language } = await req.json();
  if (!videoId || !language) {
    return NextResponse.json({ error: "videoId and language required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: sourceData } = await admin
    .from("generated_videos")
    .select("id, project_id, user_id, video_url, video_type, render_status, metadata")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  const source = sourceData as {
    id: string;
    project_id: string | null;
    user_id: string;
    video_url: string | null;
    video_type: string;
    render_status: string;
    metadata: Record<string, unknown> | null;
  } | null;

  if (!source) return NextResponse.json({ error: "Video not found" }, { status: 404 });
  if (source.render_status !== "completed" || !source.video_url) {
    return NextResponse.json({ error: "Video isn't ready yet — wait for it to finish rendering." }, { status: 400 });
  }

  const { data: profileData } = await admin
    .from("profiles")
    .select("credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    credits_remaining: number;
    long_credits_remaining: number;
    purchased_short_videos: number;
    purchased_long_videos: number;
    role: string | null;
  } | null;

  const isAdmin = profile?.role === "admin";

  // Charge the same kind (short/long) the source video was charged — a
  // translation is HeyGen's own separately-billed render, same as the
  // original. Rows created before credit_kind existed fall back to "short".
  const videoKind: VideoKind = source.metadata?.credit_kind === "long" ? "long" : "short";
  const charge = profile ? chargeFor(profile, videoKind) : null;

  if (!isAdmin && !charge) {
    return NextResponse.json(
      {
        code: "out_of_videos",
        kind: videoKind,
        error: videoKind === "long"
          ? "You've used all your long videos. Buy another in Billing or upgrade your plan."
          : "You've used all your short videos. Buy more in Billing or upgrade your plan.",
      },
      { status: 402 },
    );
  }

  const { data: videoRow, error: videoRowErr } = await admin
    .from("generated_videos")
    .insert({
      project_id: source.project_id,
      user_id: user.id,
      video_type: source.video_type,
      render_provider: "heygen_v3_translate",
      render_status: "rendering",
      source_video_id: source.id,
      translation_language: language,
    })
    .select()
    .single();

  if (videoRowErr || !videoRow) {
    return NextResponse.json({ error: `Failed to create video record: ${videoRowErr?.message ?? "unknown"}` }, { status: 500 });
  }

  try {
    const translationId = await createVideoTranslation({
      videoUrl: source.video_url,
      outputLanguage: language,
      callbackUrl: buildCallbackUrl(),
      callbackId: videoRow.id,
    });

    const creditCost = 1;
    await admin
      .from("generated_videos")
      // credit_cost enables an automatic refund if the translation later fails
      .update({ render_job_id: translationId, metadata: { credit_cost: creditCost, credit_kind: videoKind, credit_source: charge?.source ?? "plan" } })
      .eq("id", videoRow.id);

    if (charge && !isAdmin) await admin.from("profiles").update({ [charge.column]: charge.newValue }).eq("id", user.id);
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "video-translate-v3",
      credits_used: creditCost,
      response_status: 202,
    });

    return NextResponse.json({
      video: { ...videoRow, render_job_id: translationId, render_status: "rendering" },
    });
  } catch (err) {
    await admin.from("generated_videos").update({ render_status: "failed" }).eq("id", videoRow.id);
    const msg = err instanceof Error ? err.message : "Video translation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
