import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postReadyHaloVideos } from "@/lib/halo/post";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/cron/halo-post — every 10 minutes (vercel.json).
 *
 * Hands approved Halo videos that have finished to the agent's accounts,
 * scheduled for their day (lib/halo/post.ts).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = await postReadyHaloVideos(createAdminClient(), { limit: 8 });
  return NextResponse.json({ results });
}
