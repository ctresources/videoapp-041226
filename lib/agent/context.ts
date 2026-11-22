import { createAdminClient } from "@/lib/supabase/admin";
import { getAllowance, type Allowance } from "@/lib/usage/allowance";
import { connectedPlatforms } from "@/lib/home/data";
import { getMyVoice } from "@/lib/api/my-voice";
import { isValidTimeZone } from "@/lib/utils/time-zone";
import { isPaidLevel } from "@/lib/access";

/**
 * Everything the agent layer knows about an account, loaded once per call
 * (pipeline steps 2–5): plan and remaining usage, feature entitlements,
 * brand / My Voice / market / time zone, connected platforms.
 *
 * Every figure comes from the services the app itself uses: getAllowance
 * (the allowance route), connectedPlatforms (Home), getMyVoice (My Voice).
 */
export interface AgentContext {
  userId: string;
  allowance: Allowance;
  /** Paid plan, admin or staff: may use external connections. */
  paid: boolean;
  name: string | null;
  market: { city: string | null; state: string | null };
  /** IANA zone from the profile, or null when it was never set. */
  timeZone: string | null;
  myVoice: string | null;
  connected: string[];
  ready: { photoAvatar: boolean; twin: boolean; clonedVoice: boolean };
}

export async function loadContext(userId: string): Promise<AgentContext> {
  const admin = createAdminClient();
  const [allowance, profileRes, voice] = await Promise.all([
    getAllowance(admin, userId),
    admin
      .from("profiles")
      .select("full_name, location_city, location_state, time_zone, youtube_channel_id, youtube_refresh_token, social_profile_created_at, heygen_photo_id, heygen_avatar_id, heygen_digital_twin_look_id, heygen_voice_id, voice_sample_url")
      .eq("id", userId)
      .maybeSingle(),
    getMyVoice(admin, userId),
  ]);
  const p = (profileRes.data ?? {}) as Record<string, string | null>;
  const connected = await connectedPlatforms(p as never, userId);
  const tz = p.time_zone && isValidTimeZone(p.time_zone) ? p.time_zone : null;
  return {
    userId,
    allowance,
    paid: isPaidLevel(allowance.level),
    name: p.full_name ?? null,
    market: { city: p.location_city ?? null, state: p.location_state ?? null },
    timeZone: tz,
    myVoice: voice.note,
    connected,
    ready: {
      photoAvatar: !!(p.heygen_photo_id || p.heygen_avatar_id),
      twin: !!p.heygen_digital_twin_look_id,
      clonedVoice: !!(p.heygen_voice_id || p.voice_sample_url),
    },
  };
}

/** Videos the account can still make this month (admins: unlimited). */
export function videosLeft(ctx: AgentContext): number | "unlimited" {
  return ctx.allowance.unlimited ? "unlimited" : Number(ctx.allowance.short ?? 0);
}
