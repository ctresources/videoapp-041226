import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SocialPublishError, deleteProfile, disconnectAccount, ensureProfile, profileUsage,
  profileUsername, startConnect, uploadPostConfigured,
} from "@/lib/api/upload-post";
import { PARTNER_PLATFORMS, partnerPlatformLimit, type PartnerPlatform } from "@/lib/utils/social-platforms";
import { notifySocialCapacity } from "@/lib/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai";

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("subscription_tier, role, social_profile_created_at")
    .eq("id", user.id)
    .maybeSingle();
  const profile = data as { subscription_tier: string | null; role: string | null; social_profile_created_at: string | null } | null;
  return { user, admin, profile };
}

/** A platform named in a request, if it is one we post to. */
function platformFrom(value: unknown): PartnerPlatform | null {
  return PARTNER_PLATFORMS.find((p) => p.id === value)?.id ?? null;
}

/**
 * POST /api/social/connect — { platform } — the link to that platform's own
 * approval screen.
 *
 * It was a link to the partner's hosted page, where the agent picked
 * platforms before being sent on to each one. The partner advised building
 * the buttons ourselves (2026-10-14), so the approval screen is the only
 * place the agent meets their name. The agent comes back to Settings with
 * connect_status, platform and, when it did not work, error_code.
 *
 * The agent's slot with the publishing partner is created here, on the first
 * click of Connect, and not at signup: the plan holds a fixed number of
 * customers, and creating one for every account would fill it with people
 * who never connect anything.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { platform?: unknown };
  const platform = platformFrom(body.platform);
  if (!platform) return NextResponse.json({ error: "Choose a platform to connect." }, { status: 400 });

  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, admin, profile } = ctx;

  if (!uploadPostConfigured()) {
    return NextResponse.json({ error: "More platforms are coming soon. YouTube publishes from here today." }, { status: 503 });
  }
  if (partnerPlatformLimit(profile?.subscription_tier, profile?.role) <= 0) {
    return NextResponse.json(
      { error: "Posting to more platforms comes with a paid plan.", code: "plan_required" },
      { status: 403 },
    );
  }

  const username = profileUsername(user.id);
  try {
    const isNew = !profile?.social_profile_created_at;
    await ensureProfile(username);
    if (isNew) {
      await admin.from("profiles").update({ social_profile_created_at: new Date().toISOString() }).eq("id", user.id);
      // Awaited, because a serverless function stops when it answers, but
      // never allowed to fail the request: the agent's link does not depend
      // on whether the owner's alert was sent.
      try {
        const { used, limit } = await profileUsage();
        if (limit > 0 && used / limit >= 0.8) await notifySocialCapacity({ used, limit });
      } catch { /* the alert is best-effort */ }
    }
    const url = await startConnect(username, platform, `${APP_URL}/settings/social`);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof SocialPublishError) {
      if (err.code === "PROFILE_LIMIT_REACHED") {
        try { await notifySocialCapacity(await profileUsage()); } catch { /* best-effort */ }
      }
      return NextResponse.json({ error: err.message }, { status: err.status === 403 ? 409 : 502 });
    }
    console.error("[social/connect] failed:", err);
    return NextResponse.json({ error: "Couldn't open the connect page. Try again in a moment." }, { status: 500 });
  }
}

/**
 * DELETE /api/social/connect — { platform } disconnects that one. With no
 * platform, every platform at once, and the slot is given back. YouTube is
 * separate and untouched either way.
 *
 * One at a time is new with our own connect buttons: the partner's hosted
 * page was where a single account used to be removed.
 */
export async function DELETE(req: NextRequest) {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, admin, profile } = ctx;
  if (!uploadPostConfigured() || !profile?.social_profile_created_at) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({})) as { platform?: unknown };
  if (body.platform !== undefined) {
    const platform = platformFrom(body.platform);
    if (!platform) return NextResponse.json({ error: "That platform isn't one we post to." }, { status: 400 });
    try {
      await disconnectAccount(profileUsername(user.id), platform);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(`[social/connect] disconnect ${platform} failed:`, err);
      return NextResponse.json({ error: "Couldn't disconnect just now. Try again in a moment." }, { status: 502 });
    }
  }

  try {
    await deleteProfile(profileUsername(user.id));
    await admin.from("profiles").update({ social_profile_created_at: null }).eq("id", user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[social/connect] disconnect failed:", err);
    return NextResponse.json({ error: "Couldn't disconnect just now. Try again in a moment." }, { status: 502 });
  }
}
