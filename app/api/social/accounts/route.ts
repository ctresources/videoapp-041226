/**
 * GET /api/social/accounts — the social accounts this user has connected.
 *
 * Two sources. YouTube is connected natively through our own OAuth and read
 * off the profile. Everything else is connected through the publishing
 * partner (Upload-Post) and read from the user's profile there, but only for
 * a user who has actually connected something: asking for everyone would cost
 * a call per page load for accounts that have nothing to show.
 *
 * The response keeps the shape the Publish window and the settings page have
 * always read (`accounts`, `connected`, `youtubeConnected`) and adds `more`,
 * which describes the other platforms: whether they are switched on, how many
 * this plan may post to, and what each one needs.
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProfile, profileUsername, uploadPostConfigured, type ConnectedAccount } from "@/lib/api/upload-post";
import { PARTNER_PLATFORMS, partnerAccountId, partnerPlatformLimit } from "@/lib/utils/social-platforms";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[social/accounts] no user — returning 401");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read through the user's own session rather than the admin client, which
  // avoids the RLS surprises the admin path used to produce here.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("youtube_channel_id, youtube_channel_name, youtube_channel_thumbnail, youtube_refresh_token, subscription_tier, role, social_profile_created_at")
    .eq("id", user.id)
    .single();

  if (profileError) console.log("[social/accounts] profile query error:", profileError.message);

  const p = profile as {
    youtube_channel_id: string | null;
    youtube_channel_name: string | null;
    youtube_channel_thumbnail: string | null;
    /** Read only to see whether there is one. Never sent on. */
    youtube_refresh_token: string | null;
    subscription_tier: string | null;
    role: string | null;
    social_profile_created_at: string | null;
  } | null;

  const youtube = p?.youtube_channel_id
    ? [{
        id: "native_youtube",
        platform: "youtube",
        name: p.youtube_channel_name || "YouTube Channel",
        username: p.youtube_channel_name || "YouTube Channel",
        // The real UC… id, shown in the UI. A Google account can own several
        // channels with near-identical names, so the name alone cannot confirm
        // which one is connected — the id is the only unambiguous answer.
        channelId: p.youtube_channel_id,
        avatarUrl: p.youtube_channel_thumbnail || undefined,
        // The channel is known but its connection is gone: Google ended it,
        // and the token was cleared when that was found out (youtube.ts).
        needsReconnect: !p.youtube_refresh_token,
        source: "native" as const,
      }]
    : [];

  const limit = partnerPlatformLimit(p?.subscription_tier, p?.role);
  const available = uploadPostConfigured();
  let connectedMap: Record<string, ConnectedAccount | string | null> = {};
  if (available && limit > 0 && p?.social_profile_created_at) {
    try {
      connectedMap = (await getProfile(profileUsername(user.id)))?.social_accounts ?? {};
    } catch {
      // The list still returns: YouTube is ours, and a partner outage must not
      // take the Publish window down with it.
    }
  }

  const platforms = PARTNER_PLATFORMS.map((spec) => {
    const acct = connectedMap[spec.id];
    const connected = !!acct && typeof acct === "object";
    const a = connected ? (acct as ConnectedAccount) : null;
    return {
      id: spec.id,
      label: spec.label,
      needs: spec.needs,
      connected,
      name: a?.display_name || a?.handle || null,
      avatarUrl: a?.social_images || null,
      needsReconnect: a?.reauth_required === true,
    };
  });

  const others = platforms
    .filter((pl) => pl.connected)
    .map((pl) => ({
      id: partnerAccountId(pl.id),
      platform: pl.id,
      name: pl.name || pl.label,
      username: pl.name || pl.label,
      avatarUrl: pl.avatarUrl || undefined,
      needsReconnect: pl.needsReconnect,
      source: "partner" as const,
    }));

  return NextResponse.json({
    accounts: [...youtube, ...others],
    connected: youtube.length + others.length > 0,
    youtubeConnected: youtube.length > 0,
    more: {
      /** The publishing partner is switched on for this deployment. */
      available,
      /** This plan may connect and post to other platforms at all. */
      allowed: limit > 0,
      /** How many of them one video may go to; null means all. */
      limit: Number.isFinite(limit) ? limit : null,
      platforms,
    },
  });
}
