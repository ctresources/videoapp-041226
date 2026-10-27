import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autopilotEligible } from "@/lib/autopilot";
import { attachDraftVideo, draftVideo, writeSellerDraft, type DraftRow } from "@/lib/seller/auto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One Seller Update card on AutoSparks (2026-10-26).
 *
 * POST { draftId, action, ... }
 *   write    { mode: "video" | "email", views, saves, showings, openHouse, offers, feedback, nextSteps }
 *            saves the numbers, writes the email, and makes the video
 *   approve  the email is written and (unless Email only) the video is done:
 *            it sends by itself on its day
 *   reopen   back to the numbers (not once approved and sent)
 *   unapprove  stop it sending
 *   skip     no update this week
 *   camera   mark it as recorded yourself (Spark Tools records the take)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, subscription_tier").eq("id", user.id).single();
  if (!prof || !autopilotEligible(prof as { role: string | null; subscription_tier: string | null })) {
    return NextResponse.json({ error: "Seller updates on AutoSparks are part of the paid plans." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const { data } = await admin
    .from("seller_auto_drafts")
    .select("id, user_id, listing_id, update_on, slot_at, status, mode, also_text, project_id, video_id")
    .eq("id", typeof body.draftId === "string" ? body.draftId : "")
    .eq("user_id", user.id)
    .maybeSingle();
  const d = data as DraftRow | null;
  if (!d) return NextResponse.json({ error: "Card not found." }, { status: 404 });
  const set = async (patch: Record<string, unknown>) => { await admin.from("seller_auto_drafts").update(patch).eq("id", d.id); };

  switch (body.action) {
    case "write": {
      if (d.status === "approved" || d.status === "sent") return NextResponse.json({ error: "Already approved." }, { status: 409 });
      if (d.status === "making") return NextResponse.json({ error: "Your video is still being made." }, { status: 409 });
      const mode = body.mode === "email" ? "email" : "video";
      const r = await writeSellerDraft(admin, { id: user.id, email: user.email ?? null }, d, body, mode);
      return NextResponse.json(r.out, { status: r.status });
    }
    case "camera": {
      await set({ mode: "camera", status: "open" });
      return NextResponse.json({ ok: true, href: `/tools?tab=seller&listing=${d.listing_id}&on=${d.update_on}` });
    }
    case "approve": {
      const { data: up } = await admin.from("seller_listing_updates").select("email, video_url")
        .eq("listing_id", d.listing_id).eq("update_on", d.update_on).maybeSingle();
      const u = up as { email: unknown; video_url: string | null } | null;
      if (!u?.email) return NextResponse.json({ error: "Write the update first." }, { status: 409 });
      if (d.mode === "video") {
        const v = await draftVideo(admin, d);
        if (v === "making") return NextResponse.json({ error: "Your video is still being made. Watch it when it's done, then approve it." }, { status: 409 });
        if (v === "failed" || !v) return NextResponse.json({ error: "The video didn't finish. Make it again, or choose Email only." }, { status: 409 });
        if (!u.video_url) await attachDraftVideo(admin, user.id, d, v);
      }
      if (d.mode === "camera" && !u.video_url) {
        return NextResponse.json({ error: "Record your video in Spark Tools first, or choose Email only." }, { status: 409 });
      }
      await set({ status: "approved", approved_at: new Date().toISOString(), error: null });
      return NextResponse.json({ ok: true });
    }
    case "unapprove": {
      if (d.status !== "approved") return NextResponse.json({ error: "Not approved." }, { status: 409 });
      await set({ status: "ready", approved_at: null });
      return NextResponse.json({ ok: true });
    }
    case "reopen": {
      if (d.status === "sent" || d.status === "approved") return NextResponse.json({ error: "Stop it sending first." }, { status: 409 });
      await set({ status: "open", error: null });
      return NextResponse.json({ ok: true });
    }
    case "skip": {
      if (d.status === "sent") return NextResponse.json({ error: "Already sent." }, { status: 409 });
      await set({ status: "skipped" });
      return NextResponse.json({ ok: true });
    }
    case "text": {
      await set({ also_text: !!body.value });
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
