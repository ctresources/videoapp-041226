import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const admin = createAdminClient();

  // Creatomate webhook payload
  if (body.id && body.status) {
    const renderId = body.id;
    const status = body.status; // "succeeded" | "failed"
    const videoUrl = body.url;
    const metadata = body.metadata ? JSON.parse(body.metadata) : {};

    const renderStatus = status === "succeeded" ? "completed" : status === "failed" ? "failed" : "rendering";

    await admin
      .from("generated_videos")
      .update({
        render_status: renderStatus,
        video_url: videoUrl || null,
      })
      .eq("render_job_id", renderId)
      .eq("render_provider", "creatomate");

    // Update parent project status
    if (metadata.projectId) {
      await admin
        .from("projects")
        .update({ status: renderStatus === "completed" ? "ready" : renderStatus === "failed" ? "error" : "generating" })
        .eq("id", metadata.projectId);
    }

    return NextResponse.json({ received: true });
  }

  // HeyGen webhook payload
  if (body.event_type === "avatar_video.success" || body.event_type === "avatar_video.fail") {
    const videoId = body.event_data?.video_id;
    const videoUrl = body.event_data?.video_url;
    const success = body.event_type === "avatar_video.success";

    if (videoId) {
      await admin
        .from("generated_videos")
        .update({
          render_status: success ? "completed" : "failed",
          video_url: videoUrl || null,
        })
        .eq("render_job_id", videoId)
        .eq("render_provider", "heygen");
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
