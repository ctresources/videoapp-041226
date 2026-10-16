import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Quick picks for sending through BoldTrail (2026-10-15): people the agent
 * has emailed through SparkReels before (videos, blog posts, newsletters),
 * newest first, then the sellers saved on their listings. One tap adds them.
 */
export type Pick = { id: string; name: string; email: string };

export async function loadQuickPicks(admin: SupabaseClient, userId: string, max = 8): Promise<Pick[]> {
  const [{ data: sends }, { data: listings }] = await Promise.all([
    admin.from("video_email_sends").select("sent_to").eq("user_id", userId).order("sent_at", { ascending: false }).limit(30),
    admin.from("seller_listings").select("boldtrail_contacts").eq("user_id", userId).is("archived_at", null).limit(50),
  ]);
  const picks: Pick[] = [];
  const seen = new Set<string>();
  const add = (c: Partial<Pick> | null | undefined) => {
    if (!c?.id || seen.has(String(c.id)) || picks.length >= max) return;
    seen.add(String(c.id));
    picks.push({ id: String(c.id), name: c.name || c.email || "Contact", email: c.email || "" });
  };
  for (const s of sends ?? []) for (const c of (s.sent_to ?? []) as Partial<Pick>[]) add(c);
  for (const l of listings ?? []) for (const c of (l.boldtrail_contacts ?? []) as Partial<Pick>[]) add(c);
  return picks;
}

/** "Hi there," becomes "Hi Dan," when there is a first name; anything else is left as written. */
export function personalGreeting(greeting: string, firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  if (!name) return greeting;
  return /^(hi|hello|hey)\s+there\s*,?\s*$/i.test(greeting.trim())
    ? greeting.trim().replace(/\s+there\s*,?\s*$/i, ` ${name},`)
    : greeting;
}

export const firstNameOf = (name?: string | null) => {
  const n = (name ?? "").trim();
  return n && !n.includes("@") ? n.split(/\s+/)[0] : "";
};
