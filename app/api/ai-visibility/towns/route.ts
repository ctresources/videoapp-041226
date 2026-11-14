import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { aiVisibilitySession, cleanTown } from "@/lib/ai-visibility/session";
import { runTown, TOWN_SELECT, type TownRow } from "@/lib/ai-visibility/run";
import { QUESTIONS_PER_TOWN, type TownQuestion } from "@/lib/ai-visibility/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * The agent's towns for AI Visibility (2026-11-14): 1 / 2 / 3 on Creator /
 * Producer / Influencer.
 *   POST   { town, state }         add a town; its first check starts now
 *   PATCH  { id, questions }       swap questions (up to 10); kept from then on
 *   DELETE ?id=                    remove a town and its history
 */
export async function POST(req: NextRequest) {
  const s = await aiVisibilitySession();
  if (!s.ok) return s.response;
  const body = (await req.json().catch(() => ({}))) as { town?: string; state?: string };
  const place = cleanTown(body.town, body.state);
  if (!place) return NextResponse.json({ error: "Enter the town and choose its state." }, { status: 400 });

  const { count } = await s.admin.from("ai_visibility_towns").select("id", { count: "exact", head: true }).eq("user_id", s.profile.id);
  if ((count ?? 0) >= s.limit) {
    return NextResponse.json({ error: `Your plan includes ${s.limit} town${s.limit === 1 ? "" : "s"}. Move up a plan for more.`, code: "town_limit" }, { status: 403 });
  }
  const { data, error } = await s.admin.from("ai_visibility_towns")
    .insert({ user_id: s.profile.id, town: place.town, state: place.state, status: "checking" })
    .select(TOWN_SELECT).single();
  if (error || !data) {
    const dup = /duplicate|unique/i.test(error?.message ?? "");
    return NextResponse.json({ error: dup ? "You already have that town." : "Couldn't add the town. Try again." }, { status: dup ? 409 : 500 });
  }
  waitUntil(runTown(s.admin, data as TownRow).then(() => undefined));
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}

export async function PATCH(req: NextRequest) {
  const s = await aiVisibilitySession();
  if (!s.ok) return s.response;
  const body = (await req.json().catch(() => ({}))) as { id?: string; questions?: unknown };
  if (typeof body.id !== "string") return NextResponse.json({ error: "Missing town." }, { status: 400 });
  const { data: existing } = await s.admin.from("ai_visibility_towns").select("questions").eq("id", body.id).eq("user_id", s.profile.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  // A question kept as it was keeps the search it came from.
  const before = new Map(((existing as { questions: TownQuestion[] | null }).questions ?? []).map((q) => [q.q, q.search]));
  const list = Array.isArray(body.questions) ? body.questions : [];
  const seen = new Set<string>();
  const questions: TownQuestion[] = [];
  for (const raw of list) {
    const q = (typeof raw === "string" ? raw : typeof (raw as { q?: unknown })?.q === "string" ? (raw as { q: string }).q : "")
      .trim().replace(/\s+/g, " ").slice(0, 200);
    if (q.length < 8 || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    questions.push({ q, search: before.get(q) ?? null });
    if (questions.length >= QUESTIONS_PER_TOWN) break;
  }
  if (!questions.length) return NextResponse.json({ error: "Keep at least one question." }, { status: 400 });
  await s.admin.from("ai_visibility_towns").update({ questions, questions_edited: true }).eq("id", body.id).eq("user_id", s.profile.id);
  return NextResponse.json({ ok: true, questions });
}

export async function DELETE(req: NextRequest) {
  const s = await aiVisibilitySession();
  if (!s.ok) return s.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing town." }, { status: 400 });
  await s.admin.from("ai_visibility_towns").delete().eq("id", id).eq("user_id", s.profile.id);
  return NextResponse.json({ ok: true });
}
