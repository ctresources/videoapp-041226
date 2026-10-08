/**
 * POST /api/video/scene-footage   { script, shape: "vertical" | "horizontal" }
 *
 * Something to play behind you while you record, made from your script.
 *
 * The camera recorder can play your photos behind you, or a clip of your own.
 * Someone with neither had a plain take. This makes the clip: six short
 * scenes planned from the script, joined into one silent file, which the
 * recorder then treats exactly as it treats a clip you chose yourself. It
 * loops under a longer take.
 *
 * The scenes are the Scenes reel's (scene-clips.ts), under the same limits:
 * generic, American, unpeopled, no lettering, never a real place or property.
 * A take recorded over them is marked AI-made when it is saved.
 *
 * Counts as one short video, taken only once the file exists. Recording
 * yourself is free; this is the one part of it that costs something to make.
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cameraGateResponse } from "@/lib/utils/free-trial";
import { makeSceneClips, planScenes, SCENES_MIN } from "@/lib/api/scene-clips";
import { ALLOWANCE_SELECT, chargeFor, chargeOneVideo, type AllowanceColumns } from "@/lib/utils/video-allowance";
import { joinSceneClips } from "@/lib/api/scene-footage";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const SCENES = 6;
const SECONDS_EACH = 8;

export async function POST(req: NextRequest) {
  const started = Date.now();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { script?: string; shape?: string };
  const script = (body.script ?? "").trim();
  if (script.split(/\s+/).filter(Boolean).length < 20) {
    return NextResponse.json({ error: "Write or spark your script first. The scenes are made from it." }, { status: 400 });
  }
  const vertical = body.shape !== "horizontal";

  // The camera's own gate: this is part of recording yourself.
  const gate = await cameraGateResponse(user.id);
  if (gate) return gate;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(`role, subscription_tier, first_video_generated_at, ${ALLOWANCE_SELECT}`)
    .eq("id", user.id)
    .single();
  const p = (profile ?? {}) as Record<string, string | null>;
  const isAdmin = p.role === "admin";
  if (!isAdmin && !chargeFor((profile ?? {}) as Partial<AllowanceColumns>, "short")) {
    return NextResponse.json(
      {
        code: "out_of_videos",
        kind: "short",
        tier: p.subscription_tier ?? "free",
        error: "Scenes to play behind you use one short video and you have none left. Your photos or a clip of your own are free.",
      },
      { status: 402 },
    );
  }

  try {
    // The first part of a long script is enough to plan six scenes from.
    const plan = await planScenes(script.slice(0, 2000), SCENES);
    const made = (await makeSceneClips(plan, SECONDS_EACH, vertical ? "9:16" : "16:9", started + 170_000))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (made.length < SCENES_MIN) {
      return NextResponse.json(
        { error: "Not enough scenes could be made this time, so nothing was taken from your plan. Try again in a minute." },
        { status: 502 },
      );
    }

    const file = await joinSceneClips(made.map((c) => c.url), vertical ? 720 : 1280, vertical ? 1280 : 720);
    const path = `camera-recordings/${user.id}/scene-footage-${Date.now()}.mp4`;
    const { error: upErr } = await admin.storage.from("assets").upload(path, file, { contentType: "video/mp4", upsert: false });
    if (upErr) throw new Error(`Could not save the scenes: ${upErr.message}`);
    const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

    let charged: Awaited<ReturnType<typeof chargeOneVideo>> = null;
    if (!isAdmin) {
      charged = await chargeOneVideo(admin, user.id, "short");
      // The free video starts the 30-day clock, whichever kind of video it was.
      if (charged && (p.subscription_tier ?? "free") === "free" && !p.first_video_generated_at) {
        await admin.from("profiles").update({ first_video_generated_at: new Date().toISOString() }).eq("id", user.id);
      }
    }
    await admin.from("api_usage_log").insert({
      user_id: user.id,
      api_provider: "heygen",
      endpoint: "scene-footage",
      credits_used: charged ? 1 : 0,
      response_status: 200,
    });

    return NextResponse.json({
      url: publicUrl,
      scenes: made.length,
      seconds: Math.round(made.reduce((sum, c) => sum + c.seconds, 0)),
      charged: !!charged || isAdmin,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not make the scenes";
    console.error("[scene-footage]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
