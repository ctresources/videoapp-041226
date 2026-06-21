import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAvatarLook } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/avatar/generate-look
 * Body: { avatarId: string, prompt: string, name?: string }
 *
 * Billing:
 *   - First look generated in a calendar month: free
 *   - Additional looks: 1 credit each
 *   - No credits remaining: 402 with { upgrade: true }
 *   - Admins bypass all billing checks
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
    .select("role, credits_remaining, look_gen_count, look_gen_period")
    .eq("id", user.id)
    .single();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const isAdmin = profile.role === "admin";
  const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const isNewPeriod = (profile.look_gen_period as string) !== currentPeriod;
  const usedThisMonth = isNewPeriod ? 0 : (profile.look_gen_count as number);

  // Non-admin users: enforce 1 free look/month then 1 credit per additional look
  if (!isAdmin) {
    if (usedThisMonth >= 1) {
      if ((profile.credits_remaining as number) < 1) {
        return NextResponse.json(
          { error: "You've used your free look this month and have no credits left. Upgrade to generate more.", upgrade: true },
          { status: 402 },
        );
      }
    }
  }

  try {
    const look = await generateAvatarLook(avatarId, prompt.trim(), name);

    // Update usage counters
    if (!isAdmin) {
      const creditCost = usedThisMonth >= 1 ? 1 : 0;
      await admin
        .from("profiles")
        .update({
          look_gen_count: usedThisMonth + 1,
          look_gen_period: currentPeriod,
          ...(creditCost > 0 && { credits_remaining: (profile.credits_remaining as number) - creditCost }),
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
