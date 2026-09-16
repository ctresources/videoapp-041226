import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTrialWindow } from "@/lib/email";
import { FREE_TRIAL_DAYS, freeTrialDaysLeft } from "@/lib/utils/free-trial";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Send the warning when this many days or fewer remain. */
const WARN_AT_DAYS_LEFT = 3;

interface Row {
  id: string;
  email: string | null;
  full_name: string | null;
  subscription_tier: string | null;
  role: string | null;
  first_video_generated_at: string | null;
  trial_warning_email_at: string | null;
  trial_ended_email_at: string | null;
}

/**
 * GET /api/cron/trial-emails — daily Vercel Cron.
 *
 * The 30-day window opened by a free video closed in silence: the camera and
 * the tools locked, and the only notice was a badge on a dashboard the person
 * had stopped opening. This says it twice — once with a few days left, once
 * when it has gone — and never more than that.
 *
 * Only free-tier accounts whose clock has actually started. Someone who paid,
 * or who never made their free video, has nothing to be warned about.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai";

  const { data } = await admin
    .from("profiles")
    .select("id, email, full_name, subscription_tier, role, first_video_generated_at, trial_warning_email_at, trial_ended_email_at")
    .not("first_video_generated_at", "is", null)
    .in("subscription_tier", ["free", "beta"])
    .neq("role", "admin");

  const rows = (data ?? []) as Row[];
  let warned = 0;
  let ended = 0;

  for (const p of rows) {
    if (!p.email) continue;
    const daysLeft = freeTrialDaysLeft(p.first_video_generated_at);
    if (daysLeft === null) continue;

    // Closed. Sent once, and only if the warning's moment has also passed —
    // an account that somehow reached zero without ever being warned still gets
    // this one, which is the email that matters.
    if (daysLeft <= 0) {
      if (p.trial_ended_email_at) continue;
      const ok = await notifyTrialWindow({
        email: p.email,
        name: p.full_name,
        stage: "ended",
        daysLeft: 0,
        appUrl,
      });
      if (ok) {
        await admin
          .from("profiles")
          .update({ trial_ended_email_at: new Date().toISOString() })
          .eq("id", p.id);
        ended++;
      }
      continue;
    }

    // Closing. One warning per account, however many days it lands on.
    if (daysLeft <= WARN_AT_DAYS_LEFT && !p.trial_warning_email_at) {
      const ok = await notifyTrialWindow({
        email: p.email,
        name: p.full_name,
        stage: "warning",
        daysLeft,
        appUrl,
      });
      if (ok) {
        await admin
          .from("profiles")
          .update({ trial_warning_email_at: new Date().toISOString() })
          .eq("id", p.id);
        warned++;
      }
    }
  }

  console.log(`[cron/trial-emails] scanned ${rows.length}, warned ${warned}, ended ${ended} (window ${FREE_TRIAL_DAYS} days)`);
  return NextResponse.json({ scanned: rows.length, warned, ended });
}
