import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { postReadyHaloVideos } from "@/lib/halo/post";
import { sendDueSellerDrafts } from "@/lib/seller/auto";

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
  const admin = createAdminClient();
  const results = await postReadyHaloVideos(admin, { limit: 8 });
  // Approved seller updates whose day has come (2026-10-26).
  const sellers = await sendDueSellerDrafts(admin, 10);
  return NextResponse.json({ results, sellers });
}
