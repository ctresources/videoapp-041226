import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Get Halo" (2026-10-24, the owner's ask): agents without a Halo website get
 * a button to sign up, through a Halo affiliate's link. If the SparkReels
 * affiliate who referred the agent saved their own Halo link, it's theirs;
 * otherwise the owner's. Halo bills its own $99/month; SparkReels only sends
 * the agent there.
 *
 * A link is a Halo page (https://halo-name.huzi.site/) or just a code. Halo
 * signs people up by text ("CODE PRO" to its number), so a code becomes a
 * text instead of a page. Only Halo's own domains are accepted, so the button
 * can't be turned into a link to anywhere else.
 */

export const HALO_SIGNUP_PHONE = "+14157263224";
export const HALO_SIGNUP_PHONE_LABEL = "(415) 726-3224";
const OWNER_HALO = "https://halo-carmella-thompson.huzi.site/";
const HALO_HOSTS = /(^|\.)(huzi\.site|huzihalo\.com)$/i;

export type HaloLink =
  | { kind: "url"; url: string }
  | { kind: "code"; code: string };

/** What an affiliate typed, as a link we accept, or an error to show. */
export function parseHaloLink(input: string): HaloLink | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Enter your Halo page or code." };
  if (/^[a-z0-9]{4,12}$/i.test(raw)) return { kind: "code", code: raw.toUpperCase() };
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { return { error: "That isn't a web address or a code." }; }
  if (!HALO_HOSTS.test(url.hostname)) return { error: "Use your Halo page (ending in huzi.site) or your Halo code." };
  url.protocol = "https:";
  url.hash = "";
  return { kind: "url", url: url.toString() };
}

/** The saved text for a link. */
export function haloLinkText(l: HaloLink): string {
  return l.kind === "url" ? l.url : l.code;
}

/** Where this agent's Get Halo button goes. */
export async function getHaloLinkFor(admin: SupabaseClient, userId: string): Promise<{
  url: string | null; code: string | null; sms: string | null; phone: string; referrer: boolean;
  /** Whose link it is, for the click log; null = the owner's. Not sent to the browser. */
  affiliateId: string | null;
}> {
  let affiliateId: string | null = null;
  const asButton = (l: HaloLink, referrer: boolean) => l.kind === "url"
    ? { url: l.url, code: null, sms: null, phone: HALO_SIGNUP_PHONE_LABEL, referrer, affiliateId }
    : { url: null, code: l.code, sms: `sms:${HALO_SIGNUP_PHONE}?body=${encodeURIComponent(`${l.code} PRO`)}`, phone: HALO_SIGNUP_PHONE_LABEL, referrer, affiliateId };

  const { data: prof } = await admin.from("profiles").select("referred_by_affiliate_id").eq("id", userId).maybeSingle();
  const affId = (prof as { referred_by_affiliate_id: string | null } | null)?.referred_by_affiliate_id;
  if (affId) {
    const { data: aff } = await admin.from("affiliates").select("status, halo_link").eq("id", affId).maybeSingle();
    const a = aff as { status: string; halo_link: string | null } | null;
    if (a?.status === "approved" && a.halo_link) {
      const parsed = parseHaloLink(a.halo_link);
      if (!("error" in parsed)) { affiliateId = affId; return asButton(parsed, true); }
    }
  }
  return asButton({ kind: "url", url: OWNER_HALO }, false);
}
