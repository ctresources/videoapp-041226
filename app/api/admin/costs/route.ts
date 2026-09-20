import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  costsFor, FALLBACK_USD_PER_RENDER, FALLBACK_USD_PER_RENDER_SECOND, type UserCost,
} from "@/lib/utils/unit-costs";
import { NextRequest, NextResponse } from "next/server";

/**
 * What each account costs to serve, and whether its plan covers it.
 *
 * Built from what was actually spent rather than from the allowance: a plan
 * that includes four videos costs nothing until someone renders one, and the
 * accounts worth knowing about are the ones at the other end — using more than
 * they pay for. Those are invisible in a table of plans and video counts, which
 * is all the admin panel had.
 */

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") return null;
  return user;
}

interface VideoRow {
  user_id: string;
  duration_seconds: number | null;
  metadata: { heygen_cost_usd?: number | null; heygen_duration_seconds?: number | null } | null;
}

export async function GET(req: NextRequest) {
  const admin_user = await verifyAdmin();
  if (!admin_user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  /**
   * "month" is the current calendar month, matching how the image allowance
   * resets and how a subscription bills. "all" is everything, for the question
   * of what an account has cost since it existed.
   */
  const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "month";
  const since = scope === "month"
    ? new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
    : null;

  const admin = createAdminClient();

  const videoQuery = admin.from("generated_videos").select("user_id, duration_seconds, metadata");
  const imageQuery = admin.from("generated_images").select("user_id").eq("ai_background", true);
  const aiQuery = admin.from("api_usage_log").select("user_id");

  if (since) {
    videoQuery.gte("created_at", since);
    imageQuery.gte("created_at", since);
    aiQuery.gte("created_at", since);
  }

  const [{ data: profiles }, { data: videos }, { data: images }, { data: aiCalls }] = await Promise.all([
    admin.from("profiles").select("id, email, full_name, subscription_tier, role").order("created_at", { ascending: false }),
    videoQuery,
    imageQuery,
    aiQuery,
  ]);

  /**
   * What a render costs when its own cost was never recorded.
   *
   * Averaged over every render that DOES carry an invoice figure, across all
   * time rather than within the window — a month containing no priced renders
   * still has to price its unpriced ones with something better than a constant.
   */
  const { data: pricedAllTime } = await admin
    .from("generated_videos")
    .select("metadata")
    .not("metadata->heygen_cost_usd", "is", null);
  const pricedValues = ((pricedAllTime ?? []) as { metadata: { heygen_cost_usd?: number } | null }[])
    .map((r) => r.metadata?.heygen_cost_usd)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const blendedPerVideo = pricedValues.length
    ? pricedValues.reduce((a, b) => a + b, 0) / pricedValues.length
    : FALLBACK_USD_PER_RENDER;

  const byUser = new Map<string, {
    pricedCostUsd: number; pricedVideos: number;
    unpricedCostUsd: number; unpricedVideos: number;
    images: number; aiCalls: number;
  }>();
  const bucket = (id: string) => {
    let b = byUser.get(id);
    if (!b) {
      b = { pricedCostUsd: 0, pricedVideos: 0, unpricedCostUsd: 0, unpricedVideos: 0, images: 0, aiCalls: 0 };
      byUser.set(id, b);
    }
    return b;
  };

  for (const row of (videos ?? []) as VideoRow[]) {
    if (!row.user_id) continue;
    const b = bucket(row.user_id);
    const cost = row.metadata?.heygen_cost_usd;
    if (typeof cost === "number" && Number.isFinite(cost)) {
      b.pricedCostUsd += cost;
      b.pricedVideos += 1;
      continue;
    }
    // No recorded cost: price it by its duration, and when there is no
    // duration either — which is true of every render made before this was
    // recorded — by what a render costs on average here.
    const secs = row.metadata?.heygen_duration_seconds ?? row.duration_seconds ?? 0;
    const usable = typeof secs === "number" && Number.isFinite(secs) && secs > 0;
    b.unpricedVideos += 1;
    b.unpricedCostUsd += usable ? secs * FALLBACK_USD_PER_RENDER_SECOND : blendedPerVideo;
  }

  for (const row of (images ?? []) as { user_id: string }[]) {
    if (row.user_id) bucket(row.user_id).images += 1;
  }
  for (const row of (aiCalls ?? []) as { user_id: string }[]) {
    if (row.user_id) bucket(row.user_id).aiCalls += 1;
  }

  const rows: UserCost[] = ((profiles ?? []) as {
    id: string; email: string | null; full_name: string | null;
    subscription_tier: string | null; role: string | null;
  }[]).map((p) => {
    const b = byUser.get(p.id) ?? {
      pricedCostUsd: 0, pricedVideos: 0, unpricedCostUsd: 0, unpricedVideos: 0, images: 0, aiCalls: 0,
    };
    return costsFor({
      userId: p.id,
      email: p.email,
      name: p.full_name,
      tier: p.subscription_tier,
      role: p.role,
      ...b,
    });
  });

  // Costliest first: this table exists to answer "who is expensive", and
  // alphabetical or newest-first buries that under everyone who costs nothing.
  rows.sort((a, b) => b.totalUsd - a.totalUsd);

  const active = rows.filter((r) => r.totalUsd > 0 || r.revenueUsd > 0);
  const totals = {
    cost: rows.reduce((sum, r) => sum + r.totalUsd, 0),
    revenue: rows.reduce((sum, r) => sum + r.revenueUsd, 0),
    videoCost: rows.reduce((sum, r) => sum + r.videoUsdMeasured + r.videoUsdEstimated, 0),
    imageCost: rows.reduce((sum, r) => sum + r.imageUsd, 0),
    aiCost: rows.reduce((sum, r) => sum + r.aiTextUsd, 0),
    videos: rows.reduce((sum, r) => sum + r.videosPriced + r.videosEstimated, 0),
    measuredVideos: rows.reduce((sum, r) => sum + r.videosPriced, 0),
    payingUsers: rows.filter((r) => r.revenueUsd > 0).length,
    activeUsers: active.length,
    /** Accounts costing more than their plan brings in — the reason for this view. */
    underwater: rows.filter((r) => r.marginUsd < 0 && r.totalUsd > 0).length,
  };

  return NextResponse.json({
    scope,
    since,
    rows,
    totals,
    rates: {
      fallbackPerRenderSecond: FALLBACK_USD_PER_RENDER_SECOND,
      /** What an unpriced render was costed at, and how many invoices it averages. */
      blendedPerVideo,
      blendedFrom: pricedValues.length,
    },
  });
}
