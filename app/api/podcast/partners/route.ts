import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { podcastSession } from "@/lib/podcast/session";
import { endPartnership, invitePartner, listPartners, whoCanUseMe } from "@/lib/podcast/partners";

export const dynamic = "force-dynamic";

/**
 * Spark Podcast partners (2026-11-02).
 * GET    — the people I invited, and the people who may use my twin.
 * POST   { email, role } — invite someone (Spark Podcast accounts only).
 * DELETE ?id= — either side ends it: remove a partner, or take my Allow back.
 */
async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const [mine, allowedMe] = await Promise.all([listPartners(admin, user.id), whoCanUseMe(admin, user.id)]);
  return NextResponse.json({ partners: mine, allowedMe });
}

export async function POST(req: NextRequest) {
  const s = await podcastSession();
  if (!s.ok) return s.response;
  const b = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
  const { data: prof } = await s.admin.from("profiles").select("full_name").eq("id", s.user.id).single();
  const r = await invitePartner(s.admin, { id: s.user.id, name: (prof as { full_name: string | null } | null)?.full_name ?? null, email: s.user.email }, b.email ?? "", b.role ?? "");
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json(r);
}

export async function DELETE(req: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const r = await endPartnership(createAdminClient(), user.id, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 404 });
  return NextResponse.json(r);
}
