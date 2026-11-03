import crypto from "crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ensureVoiceForRender } from "@/lib/utils/voice-slot";
import { sendPodcastPartnerInvite } from "@/lib/email";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Podcast partners (2026-11-02, the owner's ask): another SparkReels user as
 * the co-host, as their own Digital Twin in their own voice. Only after they
 * press Allow, and they can take it back any time. They get a copy of each
 * episode they're in.
 */
export const PARTNER_PREFIX = "partner:";

export interface PartnerRow {
  id: string; owner_id: string; partner_email: string; partner_id: string | null;
  role: string | null; status: "invited" | "allowed" | "declined" | "removed"; token: string;
  created_at: string; responded_at: string | null;
}

interface PartnerProfile {
  id: string; full_name: string | null; email: string | null; photo_wide_url: string | null; avatar_url: string | null;
  heygen_digital_twin_look_id: string | null; twin_consent_needed: boolean | null;
  heygen_voice_id: string | null; voice_sample_url: string | null;
}
const PROFILE = "id, full_name, email, photo_wide_url, avatar_url, heygen_digital_twin_look_id, twin_consent_needed, heygen_voice_id, voice_sample_url";

/** Ready to be a co-host: a twin they've approved, and a voice. */
const isReady = (p: PartnerProfile | null) => !!p?.heygen_digital_twin_look_id && !p.twin_consent_needed && !!(p.heygen_voice_id || p.voice_sample_url);
const firstName = (n: string | null, email: string) => (n?.trim().split(/\s+/)[0] || email.split("@")[0]).slice(0, 30);

/** The owner's partners, for the co-host list and the partners card. */
export async function listPartners(admin: Admin, ownerId: string) {
  const { data } = await admin.from("podcast_partners").select("*").eq("owner_id", ownerId).neq("status", "removed").order("created_at");
  const rows = (data ?? []) as PartnerRow[];
  const ids = rows.map((r) => r.partner_id).filter((x): x is string => !!x);
  const { data: profs } = ids.length ? await admin.from("profiles").select(PROFILE).in("id", ids) : { data: [] };
  const byId = new Map(((profs ?? []) as PartnerProfile[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = r.partner_id ? byId.get(r.partner_id) ?? null : null;
    return {
      id: `${PARTNER_PREFIX}${r.id}`, rowId: r.id, email: r.partner_email, role: r.role, status: r.status,
      name: p ? firstName(p.full_name, r.partner_email) : r.partner_email,
      fullName: p?.full_name ?? null,
      image: p?.photo_wide_url || p?.avatar_url || null,
      // Allowed, and has what a co-host needs.
      ready: r.status === "allowed" && isReady(p),
      needs: r.status !== "allowed" ? null : !p?.heygen_digital_twin_look_id ? "twin" : p.twin_consent_needed ? "twin_approval" : !(p.heygen_voice_id || p.voice_sample_url) ? "voice" : null,
    };
  });
}

/** Invites (or re-invites) someone by email and sends them the Allow link. */
export async function invitePartner(admin: Admin, owner: { id: string; name: string | null; email: string | null }, emailRaw: string, roleRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter their email address." };
  if (owner.email && email === owner.email.toLowerCase()) return { error: "That's your own email." };
  const role = roleRaw.trim().slice(0, 60) || null;
  const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  const partnerId = (prof as { id: string } | null)?.id ?? null;
  const token = crypto.randomBytes(24).toString("base64url");

  const { data: existing } = await admin.from("podcast_partners").select("id, status").eq("owner_id", owner.id).ilike("partner_email", email).maybeSingle();
  const ex = existing as { id: string; status: string } | null;
  if (ex?.status === "allowed") return { error: "They've already said yes." };
  const row = { owner_id: owner.id, partner_email: email, partner_id: partnerId, role, status: "invited", token, responded_at: null };
  const { error } = ex
    ? await admin.from("podcast_partners").update(row).eq("id", ex.id)
    : await admin.from("podcast_partners").insert(row);
  if (error) return { error: "Couldn't send the invitation. Try again." };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai").replace(/\/$/, "");
  const sent = await sendPodcastPartnerInvite({
    to: email, hostName: owner.name || "A SparkReels agent", role,
    allowUrl: `${appUrl}/podcast/allow?t=${encodeURIComponent(token)}`,
    hasAccount: !!partnerId,
  });
  return { ok: true, sent, hasAccount: !!partnerId };
}

/** The invitation a link points at, with who sent it. */
export async function invitationFor(admin: Admin, token: string) {
  const { data } = await admin.from("podcast_partners").select("*").eq("token", token).maybeSingle();
  const r = data as PartnerRow | null;
  if (!r) return null;
  const { data: host } = await admin.from("profiles").select("full_name, company_name").eq("id", r.owner_id).single();
  const h = host as { full_name: string | null; company_name: string | null } | null;
  return { row: r, hostName: h?.full_name || "A SparkReels agent", hostCompany: h?.company_name ?? null };
}

/** The invited person answers. Signed in as the invited email, or already linked to it. */
export async function respondToInvite(admin: Admin, user: { id: string; email: string | null }, token: string, allow: boolean) {
  const inv = await invitationFor(admin, token);
  if (!inv) return { error: "This invitation link isn't valid any more." };
  const r = inv.row;
  const mine = r.partner_id === user.id || (!!user.email && r.partner_email.toLowerCase() === user.email.toLowerCase());
  if (!mine) return { error: `This invitation was sent to ${r.partner_email}. Sign in with that email to answer it.` };
  if (r.status === "removed") return { error: "This invitation was withdrawn." };
  await admin.from("podcast_partners").update({
    partner_id: user.id, status: allow ? "allowed" : "declined", responded_at: new Date().toISOString(),
  }).eq("id", r.id);
  return { ok: true };
}

/** Everyone who may use this person's twin, for them to see and take back. */
export async function whoCanUseMe(admin: Admin, userId: string) {
  const { data } = await admin.from("podcast_partners").select("id, owner_id, status, role, responded_at").eq("partner_id", userId).eq("status", "allowed");
  const rows = (data ?? []) as { id: string; owner_id: string; status: string; role: string | null; responded_at: string | null }[];
  const { data: owners } = rows.length ? await admin.from("profiles").select("id, full_name, company_name").in("id", rows.map((r) => r.owner_id)) : { data: [] };
  const byId = new Map(((owners ?? []) as { id: string; full_name: string | null; company_name: string | null }[]).map((o) => [o.id, o]));
  return rows.map((r) => ({ id: r.id, name: byId.get(r.owner_id)?.full_name ?? "A SparkReels agent", company: byId.get(r.owner_id)?.company_name ?? null, since: r.responded_at }));
}

/** Either side ends it: the owner removes them, or they take their Allow back. */
export async function endPartnership(admin: Admin, userId: string, rowId: string) {
  const { data } = await admin.from("podcast_partners").select("owner_id, partner_id").eq("id", rowId).maybeSingle();
  const r = data as { owner_id: string; partner_id: string | null } | null;
  if (!r || (r.owner_id !== userId && r.partner_id !== userId)) return { error: "Not found." };
  await admin.from("podcast_partners").update({ status: "removed", responded_at: new Date().toISOString() }).eq("id", rowId);
  return { ok: true };
}

/** What making an episode with a partner needs: their twin look and voice, checked now. */
export async function resolvePartnerCoHost(admin: Admin, ownerId: string, coHostId: string) {
  const rowId = coHostId.slice(PARTNER_PREFIX.length);
  const { data } = await admin.from("podcast_partners").select("*").eq("id", rowId).eq("owner_id", ownerId).maybeSingle();
  const r = data as PartnerRow | null;
  if (!r || r.status !== "allowed" || !r.partner_id) return { error: "That partner hasn't allowed it (or took it back)." };
  const { data: prof } = await admin.from("profiles").select(PROFILE).eq("id", r.partner_id).single();
  const p = prof as PartnerProfile | null;
  if (!p?.heygen_digital_twin_look_id) return { error: "Your partner hasn't made their Digital Twin yet." };
  if (p.twin_consent_needed) return { error: "Your partner's Digital Twin still needs their one-time approval." };
  const voiceId = await ensureVoiceForRender({ id: p.id, heygen_voice_id: p.heygen_voice_id, voice_sample_url: p.voice_sample_url });
  if (!voiceId) return { error: "Your partner hasn't set up their voice yet." };
  return { ok: true as const, rowId: r.id, partnerId: p.id, name: firstName(p.full_name, r.partner_email), role: r.role, lookId: p.heygen_digital_twin_look_id, voiceId };
}

/** A copy of the finished episode in the partner's My Sparks. */
export async function copyEpisodeToPartner(admin: Admin, o: { partnerId: string; title: string; videoUrl: string; script: string; sourceRowId: string; hostName: string }) {
  const { data: project } = await admin.from("projects").insert({
    user_id: o.partnerId, title: o.title, project_type: "location_script", status: "ready",
    ai_script: { kind: "podcast", title: o.title, hook: "", script: o.script, cta: "", description: "", hashtags: [], shared_by: o.hostName },
  }).select("id").single();
  if (!project) return;
  await admin.from("generated_videos").insert({
    project_id: (project as { id: string }).id, user_id: o.partnerId, video_type: "youtube_16x9",
    render_provider: "podcast_copy", render_status: "completed", video_url: o.videoUrl,
    metadata: { is_podcast: true, title: o.title, copied_from: o.sourceRowId, shared_by: o.hostName, dimension: { width: 1280, height: 720 }, orientation: "landscape" },
  });
}
