import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTwinBackdrop } from "@/lib/api/openai-image";
import {
  DEFAULT_TWIN_COLOR, TWIN_BACKGROUNDS_PER_MONTH, parseChoice, saveTwinBackground,
} from "@/lib/twin-backgrounds";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Digital Twin backgrounds (2026-10-24, the owner's mockup).
 *
 * GET  — the agent's saved backgrounds, their wide-video choice and default.
 * POST — { action, … }:
 *   describe { prompt, orientation }   an AI picture of a place they describe
 *   town     { city, state, orientation } an AI picture of their town
 *   listing  { projectId }             the listing's front photo
 *   settings { mode?, defaultBg? }     Wide videos, and the default background
 *   rename   { id, name } · delete { id }
 * Up to 20 new backgrounds a month: each AI picture costs a few cents.
 */
async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await session();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const [{ data: rows }, { data: prof }] = await Promise.all([
    admin.from("twin_backgrounds").select("id, name, kind, prompt, wide_url, tall_url, created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("profiles").select("twin_wide_mode, twin_default_bg").eq("id", user.id).single(),
  ]);
  const p = prof as { twin_wide_mode: string | null; twin_default_bg: unknown } | null;
  return NextResponse.json({
    backgrounds: rows ?? [],
    mode: p?.twin_wide_mode === "circle" ? "circle" : "background",
    defaultBg: parseChoice(p?.twin_default_bg) ?? { type: "color", value: DEFAULT_TWIN_COLOR },
  });
}

export async function POST(req: NextRequest) {
  const user = await session();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const orientation = body.orientation === "portrait" ? "portrait" : "landscape";

  const underLimit = async () => {
    const start = new Date();
    start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from("twin_backgrounds").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).neq("kind", "listing").gte("created_at", start.toISOString());
    return (count ?? 0) < TWIN_BACKGROUNDS_PER_MONTH;
  };

  try {
    switch (body.action) {
      case "describe":
      case "town": {
        if (!(await underLimit())) return NextResponse.json({ error: `That's ${TWIN_BACKGROUNDS_PER_MONTH} new backgrounds this month. Pick a saved one or a color.` }, { status: 429 });
        let description: string;
        let name: string;
        if (body.action === "describe") {
          description = str(body.prompt, 300);
          if (description.length < 4) return NextResponse.json({ error: "Describe the place in a few words." }, { status: 400 });
          name = description.length > 40 ? `${description.slice(0, 38)}…` : description;
        } else {
          const city = str(body.city, 80);
          const state = str(body.state, 40);
          if (!city) return NextResponse.json({ error: "This video has no town yet." }, { status: 400 });
          description = `a pleasant, sunny residential street in ${city}${state ? `, ${state}` : ""}, with trees and houses typical of the area`;
          name = `Town · ${city}`;
        }
        const bytes = await generateTwinBackdrop({ description, orientation });
        if (!bytes) return NextResponse.json({ error: "Couldn't make that picture just now. Try again." }, { status: 502 });
        const row = await saveTwinBackground(admin, user.id, bytes, { name, kind: body.action === "describe" ? "described" : "town", prompt: description });
        return NextResponse.json({ background: row });
      }

      case "listing": {
        const { data: proj } = await admin.from("projects").select("listing_data, title").eq("id", str(body.projectId, 64)).eq("user_id", user.id).maybeSingle();
        const p = proj as { listing_data: { photoUrls?: string[]; address?: string } | null; title: string | null } | null;
        const photo = (p?.listing_data?.photoUrls ?? []).find((u) => typeof u === "string" && u.startsWith("http"));
        if (!photo) return NextResponse.json({ error: "This video has no listing photo." }, { status: 400 });
        const res = await fetch(photo, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return NextResponse.json({ error: "Couldn't fetch the listing photo." }, { status: 502 });
        const name = `Listing · ${(p?.listing_data?.address || p?.title || "front photo").slice(0, 50)}`;
        const row = await saveTwinBackground(admin, user.id, Buffer.from(await res.arrayBuffer()), { name, kind: "listing" });
        return NextResponse.json({ background: row });
      }

      case "settings": {
        const patch: Record<string, unknown> = {};
        if (body.mode === "background" || body.mode === "circle") patch.twin_wide_mode = body.mode;
        if (body.defaultBg !== undefined) {
          const choice = parseChoice(body.defaultBg);
          if (!choice || choice.type === "circle") return NextResponse.json({ error: "Unknown background." }, { status: 400 });
          patch.twin_default_bg = choice;
        }
        if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
        const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
        if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case "rename": {
        const name = str(body.name, 80);
        if (!name) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
        await admin.from("twin_backgrounds").update({ name }).eq("id", str(body.id, 64)).eq("user_id", user.id);
        return NextResponse.json({ ok: true });
      }

      case "delete": {
        const id = str(body.id, 64);
        await admin.from("twin_backgrounds").delete().eq("id", id).eq("user_id", user.id);
        // The files go too (SQL can't delete storage objects; the Storage API can).
        await admin.storage.from("assets").remove([`${user.id}/twin-bg/${id}-wide.jpg`, `${user.id}/twin-bg/${id}-tall.jpg`]).catch(() => {});
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("[twin-backgrounds]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong." }, { status: 500 });
  }
}
