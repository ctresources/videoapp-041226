import { NextRequest, NextResponse } from "next/server";
import { aiVisibilitySession } from "@/lib/ai-visibility/session";

export const dynamic = "force-dynamic";

/** POST { website } — the agent's own website, checked as one of their links (2026-11-14). Empty clears it. */
export async function POST(req: NextRequest) {
  const s = await aiVisibilitySession();
  if (!s.ok) return s.response;
  const body = (await req.json().catch(() => ({}))) as { website?: string };
  const raw = (body.website ?? "").trim().slice(0, 200);
  let website: string | null = null;
  if (raw) {
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!u.hostname.includes(".")) throw new Error("no dot");
      website = `https://${u.hostname.replace(/^www\./i, "").toLowerCase()}`;
    } catch {
      return NextResponse.json({ error: "That doesn't look like a website address." }, { status: 400 });
    }
  }
  await s.admin.from("ai_visibility_settings").upsert({ user_id: s.profile.id, website, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, website });
}
