import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffLimits, STAFF_NO_EMAIL } from "@/lib/staff/staff";
import { LEAD_COLS, buildLeadEmail, chooseLead, sendLead, writeLead, type LeadEmail, type LeadRow } from "@/lib/halo/leads";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * One Halo lead's card on AutoSparks (2026-11-09). Nothing is made on its own.
 *
 * POST { leadId, action }:
 *   "write" — writes the email and the video script (free).
 *   "script" { script } — saves the script as edited.
 *   "video" | "camera" | "email" { script? } — who says it: Avatar video
 *       (uses 1 short video), Me on camera (the take comes back to the card),
 *       or Email only.
 *   "back" — back to the script, to choose again.
 *   "edit" { subject, note, videoLine, toolsIntro, after } — the email's words.
 *   "preview" — the email exactly as it will go.
 *   "approve" — sends it now.
 *   "skip" / "undo"
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & { leadId?: string; action?: string };
  if (!body.leadId || !body.action) return NextResponse.json({ error: "Missing lead" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("halo_leads").select(LEAD_COLS).eq("id", body.leadId).eq("user_id", user.id).maybeSingle();
  const l = data as LeadRow | null;
  if (!l) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const me = { id: user.id, email: user.email ?? null };
  const busy = ["writing", "making", "sending", "sent"].includes(l.status);
  const text = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).trim().slice(0, max) : undefined);

  switch (body.action) {
    case "write": {
      if (busy) return NextResponse.json({ error: "This one is already on its way." }, { status: 409 });
      const r = await writeLead(admin, user.id, l);
      return NextResponse.json(r.out, { status: r.status });
    }
    case "script": {
      const script = text("script", 2500);
      if (busy || script === undefined) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
      await admin.from("halo_leads").update({ script, updated_at: new Date().toISOString() }).eq("id", l.id);
      return NextResponse.json({ ok: true });
    }
    case "video":
    case "camera":
    case "email": {
      if (busy) return NextResponse.json({ error: "This one is already on its way." }, { status: 409 });
      const r = await chooseLead(admin, me, l, body.action, text("script", 2500));
      return NextResponse.json(r.out, { status: r.status });
    }
    case "back": {
      if (busy || !l.email_draft) return NextResponse.json({ error: "Can't change it now." }, { status: 409 });
      await admin.from("halo_leads").update({ status: "written", mode: null, video_id: null, camera_since: null, error: null }).eq("id", l.id);
      return NextResponse.json({ ok: true });
    }
    case "edit": {
      if (!l.email_draft || l.status === "sent" || l.status === "sending") return NextResponse.json({ error: "Nothing to edit." }, { status: 400 });
      const e: LeadEmail = { ...l.email_draft };
      const subject = text("subject", 150), note = text("note", 4000);
      if (subject) e.subject = subject;
      if (note) e.note = note;
      for (const k of ["videoLine", "toolsIntro", "after"] as const) {
        const v = text(k, 3000);
        if (v !== undefined) e[k] = v;
      }
      await admin.from("halo_leads").update({ email_draft: e, updated_at: new Date().toISOString() }).eq("id", l.id);
      return NextResponse.json({ ok: true, email: e });
    }
    case "preview": {
      const built = await buildLeadEmail(admin, user.id, l);
      if (!built) return NextResponse.json({ error: "Write the email first." }, { status: 400 });
      return NextResponse.json({ subject: built.subject, html: built.html });
    }
    case "approve": {
      if ((await staffLimits(user.id))?.emails === false) return NextResponse.json({ error: STAFF_NO_EMAIL, code: "staff_access" }, { status: 403 });
      if (l.status !== "ready") return NextResponse.json({ error: "It isn't ready to send yet." }, { status: 409 });
      const r = await sendLead(admin, me, l);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
      return NextResponse.json({ ok: true, via: r.via });
    }
    case "skip":
      if (l.status === "sent" || l.status === "sending") return NextResponse.json({ error: "Already sent." }, { status: 409 });
      await admin.from("halo_leads").update({ status: "skipped" }).eq("id", l.id);
      return NextResponse.json({ ok: true });
    case "undo":
      if (l.status !== "skipped") return NextResponse.json({ ok: true });
      await admin.from("halo_leads").update({
        status: !l.email_draft ? "new" : (l.mode === "email" || l.video_id) ? "ready" : "written",
      }).eq("id", l.id);
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
