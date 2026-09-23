import { createAdminClient } from "@/lib/supabase/admin";
import { retireVoiceClone } from "@/lib/utils/voice-slot";
import { NextRequest, NextResponse } from "next/server";

/**
 * Reclaims voice slots from accounts that recorded a voice and then stopped.
 *
 * The render service allows a fixed number of cloned voices per account, so
 * the expensive case is not the agent making videos — it is the one who
 * recorded during onboarding, never rendered anything, and holds a slot
 * indefinitely. The retire-after-render rule never fires for them, because
 * there is no render.
 *
 * Their sample is kept, so this costs them nothing: the voice is rebuilt the
 * moment a render needs it. Paying accounts are left alone at any age — a slot
 * is cheaper than making a customer wait for a restore.
 */

// Without this the route is prerendered, so a build queries the database and
// retires voices — the same mistake the other crons already guard against.
export const dynamic = "force-dynamic";

/** How quiet an account must be before its slot is taken back. */
const IDLE_DAYS = 7;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - IDLE_DAYS * 86400_000).toISOString();

  /**
   * Free accounts holding a clone whose sample we still have.
   *
   * Age is measured from the sample, which is when the clone was made — the
   * profile has no "last rendered" column, and adding one to answer this would
   * be a write on every render to serve a nightly job.
   */
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, heygen_voice_id, voice_sample_url, voice_sample_at, role, subscription_tier")
    .not("heygen_voice_id", "is", null)
    .not("voice_sample_url", "is", null)
    .lt("voice_sample_at", cutoff);

  if (error) {
    console.error("[cron/voice-slots]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string; email: string | null; heygen_voice_id: string | null;
    role: string | null; subscription_tier: string | null;
  }[];

  let retired = 0;
  for (const row of rows) {
    if (row.role === "admin") continue;
    if (row.subscription_tier && row.subscription_tier !== "free") continue;

    /**
     * One last check against the videos themselves.
     *
     * A free account can still be mid-flow — a render submitted an hour ago on
     * a sample recorded eight days back — and taking its voice away between
     * submit and callback would put the wrong voice in a video somebody is
     * waiting for.
     */
    const { count } = await admin
      .from("generated_videos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", row.id)
      .gte("created_at", new Date(Date.now() - 2 * 86400_000).toISOString());
    if ((count ?? 0) > 0) continue;

    await retireVoiceClone(row.id, row.heygen_voice_id, `idle ${IDLE_DAYS}d`);
    retired += 1;
  }

  console.log(`[cron/voice-slots] checked ${rows.length}, retired ${retired}`);
  return NextResponse.json({ checked: rows.length, retired });
}
