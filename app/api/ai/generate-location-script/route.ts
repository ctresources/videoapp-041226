import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createSparkScript, type CreateSparkBody } from "@/lib/scripts/create-spark";
import { toResponse } from "@/lib/content/service-result";

/**
 * The heaviest route in the app: a research-backed script plus a ~1,300-word
 * blog, then a second call for the YouTube copy. It runs on a long budget so
 * it isn't cut off as a 504 after the script has been written and paid for.
 *
 * The work lives in lib/scripts/create-spark.ts (2026-11-22), shared with the
 * agent layer's write_script. Same request, responses and refusals as before.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  /**
   * Weekly Autopilot writes drafts for an agent who isn't signed in
   * (lib/autopilot.ts, 2026-10-21). It comes in with the cron secret and says
   * whose draft it is; every other request is the signed-in agent, as before.
   */
  const asUser = req.headers.get("x-autopilot-user");
  const cronSecret = process.env.CRON_SECRET;
  let user: { id: string } | null = null;
  if (asUser && cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    user = { id: asUser };
  } else {
    const supabase = await createClient();
    user = (await supabase.auth.getUser()).data.user;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as CreateSparkBody;
  return toResponse(await createSparkScript(user.id, body, { fromAutopilot: !!asUser, req }));
}
