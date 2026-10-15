import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmailSignature } from "@/lib/utils/email-html";

/**
 * The agent's email sign-off from their profile, for the emails written on
 * the server (newsletter, seller update): name, company, phone, website and
 * headshot, the same fields the Share Kit's email version signs with.
 */
export async function loadAgentSignature(
  admin: SupabaseClient,
  userId: string,
): Promise<EmailSignature> {
  const { data } = await admin
    .from("profiles")
    .select("full_name, company_name, phone, company_phone, website, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const p = (data ?? {}) as {
    full_name?: string | null; company_name?: string | null; phone?: string | null;
    company_phone?: string | null; website?: string | null; avatar_url?: string | null;
  };
  return {
    name: p.full_name ?? null,
    company: p.company_name ?? null,
    phone: p.phone || p.company_phone || null,
    website: p.website ?? null,
    headshotUrl: p.avatar_url ?? null,
  };
}
