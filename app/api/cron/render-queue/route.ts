import { NextRequest, NextResponse } from "next/server";
import { processRenderQueue } from "@/lib/video/render-queue";

/**
 * Every minute: start the videos waiting in line, oldest first, while HeyGen
 * has free slots. Returns at once when nobody is waiting.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await processRenderQueue();
  if (result.started || result.failed || result.waiting) console.log("[cron/render-queue]", result);
  return NextResponse.json(result);
}
