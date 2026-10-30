import { NextRequest, NextResponse } from "next/server";
import { podcastSession } from "@/lib/podcast/session";
import { listCoHosts, writeConversation } from "@/lib/podcast/podcast";
import { readPage } from "@/lib/halo/site-reader";
import { resolveCta } from "@/lib/utils/default-cta";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/podcast/script — writes the two-person conversation (free,
 * nothing made). { topic, source: "topic"|"url"|"spark"|"text", url?,
 * projectId?, text?, minutes, feel, coHostId }
 */
export async function POST(req: NextRequest) {
  const s = await podcastSession();
  if (!s.ok) return s.response;
  const b = (await req.json().catch(() => ({}))) as {
    topic?: string; source?: string; url?: string; projectId?: string; text?: string;
    minutes?: number; feel?: string; coHostId?: string;
  };
  let topic = (b.topic ?? "").trim().slice(0, 300);
  let material = "";
  if (b.source === "url") {
    const url = (b.url ?? "").trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) return NextResponse.json({ error: "Paste the whole link, starting with https://" }, { status: 400 });
    const page = await readPage(url).catch(() => null);
    if (!page?.text) return NextResponse.json({ error: "Couldn't read that page. Paste the text instead." }, { status: 400 });
    material = page.text;
    if (!topic) topic = page.title;
  } else if (b.source === "spark") {
    const { data } = await s.admin.from("projects").select("title, ai_script").eq("id", b.projectId ?? "").eq("user_id", s.user.id).maybeSingle();
    const pr = data as { title: string | null; ai_script: { blog_body?: string; script?: string } | null } | null;
    if (!pr) return NextResponse.json({ error: "Pick one of your Sparks." }, { status: 400 });
    material = [pr.ai_script?.blog_body, pr.ai_script?.script].filter(Boolean).join("\n\n");
    if (!topic) topic = pr.title ?? "";
  } else if (b.source === "text") {
    material = (b.text ?? "").trim().slice(0, 20000);
    if (material.length < 80) return NextResponse.json({ error: "Paste a little more text to work from." }, { status: 400 });
  }
  if (!topic && !material) return NextResponse.json({ error: "What's the episode about?" }, { status: 400 });

  const { data: prof } = await s.admin.from("profiles")
    .select("full_name, company_name, location_city, location_state, default_cta, market_years").eq("id", s.user.id).single();
  const p = prof as { full_name: string | null; company_name: string | null; location_city: string | null; location_state: string | null; default_cta: string | null; market_years: string | null } | null;
  const coHost = (await listCoHosts().catch(() => [])).find((c) => c.id === b.coHostId);
  try {
    const cta = resolveCta(p?.default_cta, { city: p?.location_city, state: p?.location_state, name: p?.full_name, company: p?.company_name, years: p?.market_years });
    const convo = await writeConversation({
      topic: topic || "the main points of this material", source: material || undefined,
      minutes: Number(b.minutes) || 3, feel: b.feel ?? "chat",
      hostName: p?.full_name?.split(/\s+/)[0] || "Your host", guestName: coHost?.name || "Co-host",
      city: p?.location_city, state: p?.location_state, cta,
    });
    return NextResponse.json(convo);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't write it. Try again." }, { status: 502 });
  }
}
