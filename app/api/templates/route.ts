import { NextRequest, NextResponse } from "next/server";
import { templateSession } from "@/lib/templates/session";
import { DESIGNS, defaultFields, designById, type DesignId, type Shape } from "@/lib/templates/designs";
import { accentOf, makeTemplateVideo, phoneOf, previewImage, rewordTemplateVideo, templateProfile, writeTemplateScript } from "@/lib/templates/make";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { hasAdminPerks } from "@/lib/utils/roles";

export const dynamic = "force-dynamic";
// Changing the words re-makes the video's picture (about a minute).
export const maxDuration = 300;

/**
 * Video templates (2026-11-02, the owner's approved mockup), behind the
 * "video_templates" switch.
 * GET  — the designs, starting words for each, saved listings, videos left.
 * POST { action: "preview" | "script" | "make" | "reword", … }
 */
const shapeOf = (s: unknown): Shape => (s === "horizontal" ? "horizontal" : "vertical");
const cleanFields = (f: unknown) => Object.fromEntries(Object.entries((f && typeof f === "object" ? f : {}) as Record<string, unknown>)
  .map(([k, v]) => [k.slice(0, 20), String(v ?? "").slice(0, 160)]));

export async function GET() {
  const s = await templateSession();
  if (!s.ok) return s.response;
  const p = await templateProfile(s.admin, s.user.id);
  const { data: projects } = await s.admin.from("projects").select("id, listing_data, created_at")
    .eq("user_id", s.user.id).not("listing_data", "is", null).order("created_at", { ascending: false }).limit(20);
  type L = { address?: string; price?: string | number; beds?: string | number; baths?: string | number; sqft?: string | number; photoUrls?: string[] };
  const listings = ((projects ?? []) as { id: string; listing_data: L | null }[])
    .filter((x) => x.listing_data?.address)
    .map((x) => ({ id: x.id, address: x.listing_data!.address!, price: x.listing_data!.price ?? "", beds: x.listing_data!.beds ?? "", baths: x.listing_data!.baths ?? "", sqft: x.listing_data!.sqft ?? "", photos: (x.listing_data!.photoUrls ?? []).filter((u) => /^https:\/\//.test(u)).slice(0, 12) }));
  const prof = { name: p?.full_name, phone: phoneOf(p), company: p?.company_name, website: p?.website, city: p?.location_city, state: p?.location_state };
  const { data: allow } = await s.admin.from("profiles").select(ALLOWANCE_SELECT).eq("id", s.user.id).single();
  return NextResponse.json({
    designs: DESIGNS.map((d) => ({ ...d, defaults: defaultFields(d.id, prof) })),
    profile: prof, accent: accentOf(p), listings,
    videosLeft: hasAdminPerks(p?.role) ? null : availableFor(allow as never, "short"),
  });
}

export async function POST(req: NextRequest) {
  const s = await templateSession();
  if (!s.ok) return s.response;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const design = String(b.design ?? "") as DesignId;
  const shape = shapeOf(b.shape);
  const fields = cleanFields(b.fields);

  if (b.action === "reword") {
    const r = await rewordTemplateVideo(s.admin, s.user.id, String(b.videoId ?? ""), fields);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }
  if (!designById(design)) return NextResponse.json({ error: "Pick a design." }, { status: 400 });
  const p = await templateProfile(s.admin, s.user.id);

  if (b.action === "preview") {
    const photo = typeof b.photo === "string" && /^https:\/\//.test(b.photo) ? b.photo : null;
    const img = await previewImage({ design, shape, fields, photo, p });
    return new NextResponse(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  }
  if (b.action === "script") {
    try {
      const script = await writeTemplateScript({ design, shape, fields, name: p?.full_name ?? null, city: p?.location_city ?? null });
      return NextResponse.json({ script });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't write the script." }, { status: 502 });
    }
  }
  if (b.action === "make") {
    const photos = Array.isArray(b.photos) ? b.photos.filter((u): u is string => typeof u === "string") : [];
    const d = designById(design)!;
    // Named by its headline ("Price Improvement: 24 Shagbark Ct"), in title case.
    const head = (fields.headline || d.name).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const title = String(b.title ?? "").trim().slice(0, 100) || [head, fields.address || fields.name || fields.title].filter(Boolean).join(": ");
    const r = await makeTemplateVideo(s.admin, s.user, { design, shape, fields, photos, script: String(b.script ?? ""), title });
    if ("error" in r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
    return NextResponse.json(r);
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
