/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Refunds the credits charged for a video whose render failed.
 *
 * The charge is recorded as `metadata.credit_cost` on the generated_videos row
 * at the moment the credits are deducted (after successful submission to
 * HeyGen). Rows without a numeric credit_cost were never charged — e.g. the
 * submission itself failed — so they are never refunded.
 *
 * Exactly-once: the failure can be observed twice (HeyGen webhook + client
 * status poll racing). Before crediting, we "claim" the refund by setting
 * metadata.credits_refunded with a conditional update; only the caller whose
 * claim matched a row performs the credit increment.
 */
export async function refundVideoCredits(
  admin: any,
  videoId: string,
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("generated_videos")
      .select("id, user_id, metadata")
      .eq("id", videoId)
      .single();

    if (!row) return;
    const meta = (row.metadata as Record<string, unknown> | null) ?? {};

    const cost = meta.credit_cost;
    if (typeof cost !== "number" || cost <= 0) return; // never charged
    if (meta.credits_refunded === true) return; // already refunded

    // Claim the refund — the .or() filter makes this a no-op if another
    // request refunded in the meantime, and .select() tells us who won.
    const { data: claimed } = await admin
      .from("generated_videos")
      .update({ metadata: { ...meta, credits_refunded: true } })
      .eq("id", videoId)
      .or("metadata->>credits_refunded.is.null,metadata->>credits_refunded.neq.true")
      .select("id");

    if (!claimed?.length) return; // lost the race — other caller refunds

    const { data: profile } = await admin
      .from("profiles")
      .select("credits_remaining")
      .eq("id", row.user_id)
      .single();

    const current = (profile as { credits_remaining: number } | null)?.credits_remaining ?? 0;
    await admin
      .from("profiles")
      .update({ credits_remaining: current + cost })
      .eq("id", row.user_id);

    await admin.from("api_usage_log").insert({
      user_id: row.user_id,
      api_provider: "heygen",
      endpoint: "render-failed-refund",
      credits_used: -cost,
      response_status: 200,
    });

    console.log(`[refund] Returned ${cost} credit(s) to ${row.user_id} for failed video ${videoId}`);
  } catch (err) {
    console.error(`[refund] Failed to refund credits for video ${videoId}:`, err);
  }
}
