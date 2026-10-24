import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import {
  buildThumbnail, candidates, insertDraft, planHaloDrafts, sanitizeSettings, sanitizeSetupPatch, writeHaloDraft,
  type HaloSetup,
} from "@/lib/halo";
import { zoneOf } from "@/lib/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/halo/draft — changes to one Halo draft from the AutoSparks page.
 *
 * { draftId, action: "setup", setup }        this video's look, size, accounts …
 * { draftId, action: "when", slotAt }         its day and time
 * { draftId, action: "picture", picture, pictureUrl? }  rebuild the thumbnail
 * { draftId, action: "skip" }                 set aside; its day is filled again
 * { action: "use", pageId, replaceDraftId? }  a page from "Also new on your
 *        sites": into the first open day, or in place of a draft not yet approved
 */
export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;

  if (action === "use") return useInstead(s, body);

  const draftId = typeof body.draftId === "string" ? body.draftId : "";
  const { data } = await s.admin
    .from("autopilot_drafts")
    .select("id, status, source, setup, project_id, halo_page_id, slot_at, source_url")
    .eq("id", draftId)
    .eq("user_id", s.user.id)
    .single();
  const d = data as { id: string; status: string; source: string; setup: HaloSetup; project_id: string | null; halo_page_id: string | null; slot_at: string; source_url: string | null } | null;
  if (!d || (d.source !== "halo" && d.source !== "halo_promo")) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  const editable = d.status === "draft" || d.status === "failed";

  if (action === "setup") {
    if (!editable) return NextResponse.json({ error: "This one is already approved." }, { status: 409 });
    const setup = sanitizeSetupPatch(body.setup, d.setup);
    await s.admin.from("autopilot_drafts").update({ setup }).eq("id", d.id);
    return NextResponse.json({ setup });
  }

  if (action === "when") {
    if (!editable) return NextResponse.json({ error: "This one is already approved." }, { status: 409 });
    const at = typeof body.slotAt === "string" ? new Date(body.slotAt) : null;
    if (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 30 * 60_000) {
      return NextResponse.json({ error: "Pick a time at least half an hour from now." }, { status: 400 });
    }
    const { error } = await s.admin.from("autopilot_drafts").update({ slot_at: at.toISOString() }).eq("id", d.id);
    if (error) return NextResponse.json({ error: /unique|duplicate/i.test(error.message) ? "Another Halo video already has that time." : "Couldn't save the time." }, { status: 400 });
    return NextResponse.json({ slotAt: at.toISOString() });
  }

  if (action === "picture") {
    if (!d.project_id) return NextResponse.json({ error: "Still writing. Try again in a minute." }, { status: 409 });
    const picture = body.picture === "post" || body.picture === "ai" || body.picture === "upload" ? body.picture : null;
    if (!picture) return NextResponse.json({ error: "Unknown picture." }, { status: 400 });
    let url: string | null = null;
    if (picture === "post") {
      const { data: page } = d.halo_page_id
        ? await s.admin.from("halo_pages").select("image_url").eq("id", d.halo_page_id).single()
        : { data: null };
      url = (page as { image_url: string | null } | null)?.image_url ?? null;
      if (!url) return NextResponse.json({ error: "This post has no photo." }, { status: 400 });
    }
    if (picture === "upload") {
      const u = typeof body.pictureUrl === "string" ? body.pictureUrl : "";
      // Only a picture the agent put in our own storage.
      if (!u.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/${s.user.id}/`)) {
        return NextResponse.json({ error: "Upload the picture again." }, { status: 400 });
      }
      url = u;
    }
    // The old thumbnail goes, or the builder would keep its background.
    await s.admin.from("projects").update({ thumbnail_url: null }).eq("id", d.project_id);
    const thumb = await buildThumbnail(s.admin, s.user.id, d.project_id, url, { noMarket: d.source === "halo_promo" });
    if (!thumb) return NextResponse.json({ error: "Couldn't make the thumbnail. Try again." }, { status: 502 });
    const setup = { ...d.setup, picture, pictureUrl: picture === "upload" ? url : null };
    await s.admin.from("autopilot_drafts").update({ setup }).eq("id", d.id);
    return NextResponse.json({ thumbnailUrl: thumb, setup });
  }

  if (action === "skip") {
    if (!editable) return NextResponse.json({ error: "This one is already approved." }, { status: 409 });
    await s.admin.from("autopilot_drafts").update({ status: "skipped" }).eq("id", d.id);
    if (d.halo_page_id) await s.admin.from("halo_pages").update({ status: "passed" }).eq("id", d.halo_page_id);
    // Its day is open again: fill it with the next best page, if there is one.
    if (d.source === "halo") {
      const { written } = await planHaloDrafts(s.admin, s.profile);
      waitUntil(written);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

async function useInstead(
  s: Extract<Awaited<ReturnType<typeof haloSession>>, { ok: true }>,
  body: Record<string, unknown>,
) {
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const settings = sanitizeSettings(s.profile.halo_settings);
  const page = (await candidates(s.admin, s.user.id, { ...settings, types: ["other"] }, 200)).find((p) => p.id === pageId);
  if (!page) return NextResponse.json({ error: "That page isn't available any more." }, { status: 404 });
  const tz = zoneOf(s.profile);

  let slot: Date | null = null;
  const replaceId = typeof body.replaceDraftId === "string" ? body.replaceDraftId : "";
  if (replaceId) {
    const { data } = await s.admin
      .from("autopilot_drafts")
      .select("id, status, source, slot_at, halo_page_id")
      .eq("id", replaceId)
      .eq("user_id", s.user.id)
      .single();
    const old = data as { id: string; status: string; source: string; slot_at: string; halo_page_id: string | null } | null;
    if (!old || old.source !== "halo" || !["draft", "failed", "writing"].includes(old.status)) {
      return NextResponse.json({ error: "That draft can't be swapped now." }, { status: 409 });
    }
    await s.admin.from("autopilot_drafts").update({ status: "skipped" }).eq("id", old.id);
    // The page it was made from goes back on the list.
    if (old.halo_page_id) await s.admin.from("halo_pages").update({ status: "new" }).eq("id", old.halo_page_id);
    slot = new Date(old.slot_at);
  }
  if (!slot) return NextResponse.json({ error: "Pick the draft to replace." }, { status: 400 });

  const id = await insertDraft(s.admin, s.profile, settings, page, slot, tz);
  if (!id) return NextResponse.json({ error: "Couldn't swap it. Try again." }, { status: 500 });
  waitUntil(writeHaloDraft(s.admin, id, s.profile, page));
  return NextResponse.json({ id });
}
