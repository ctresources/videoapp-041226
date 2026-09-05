import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAvatarLook } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWANCE_SELECT, availableFor, chargeOneVideo } from "@/lib/utils/video-allowance";

/**
 * POST /api/avatar/generate-look
 * Body: { avatarId: string, prompt: string, name?: string }
 *
 * Billing:
 *   - First look generated in a calendar month: free
 *   - Additional looks: one SHORT video from the allowance
 *   - Nothing left: 402 with { upgrade: true }
 *   - Admins bypass all billing checks
 *
 * This route used to read and write profiles.credits_remaining by hand, which
 * is only the PLAN short balance. Purchased short videos never expire and are
 * spent by every other route, so someone holding three bought videos was
 * refused here and told to upgrade — while /billing and /dashboard both
 * showed the three they owned. It now goes through the same allowance the
 * renderer uses, so what a look costs and what the app says you have are the
 * same number.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const avatarId = body.avatarId as string | undefined;
  const prompt = body.prompt as string | undefined;
  const name = (body.name as string | undefined) || `New Look ${new Date().toLocaleDateString()}`;

  if (!avatarId) return NextResponse.json({ error: "avatarId required" }, { status: 400 });
  if (!prompt || prompt.trim().length < 10) {
    return NextResponse.json({ error: "prompt must be at least 10 characters" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select(`role, look_gen_count, look_gen_period, ${ALLOWANCE_SELECT}`)
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const isAdmin = profile.role === "admin";
  const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const isNewPeriod = (profile.look_gen_period as string) !== currentPeriod;
  const usedThisMonth = isNewPeriod ? 0 : (profile.look_gen_count as number);

  // 1 free look a month, then one short video per look — plan balance first,
  // then purchased, exactly as a render spends them.
  if (!isAdmin && usedThisMonth >= 1) {
    if (availableFor(profile, "short") < 1) {
      return NextResponse.json(
        {
          error:
            "You've used your free look this month. Another one uses a short video, and you have none left.",
          upgrade: true,
        },
        { status: 402 },
      );
    }
  }

  try {
    const look = await generateAvatarLook(avatarId, prompt.trim(), name);

    // Update usage counters
    if (!isAdmin) {
      const creditCost = usedThisMonth >= 1 ? 1 : 0;
      // The counter and the charge are separate writes now: the charge is
      // conditional on the balance being unchanged (see chargeOneVideo), so
      // two looks started at once cannot spend the same video twice.
      if (creditCost > 0) await chargeOneVideo(admin, user.id, "short");
      await admin
        .from("profiles")
        .update({
          look_gen_count: usedThisMonth + 1,
          look_gen_period: currentPeriod,
        })
        .eq("id", user.id);

      await admin.from("api_usage_log").insert({
        user_id: user.id,
        api_provider: "heygen",
        endpoint: "generate_look",
        credits_used: creditCost,
        response_status: 200,
      });
    }

    return NextResponse.json({
      look,
      freeUsed: usedThisMonth === 0,
    });
  } catch (err) {
    console.error("[generate-look] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Look generation failed" },
      { status: 422 },
    );
  }
}
