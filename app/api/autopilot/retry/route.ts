import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AUTOPILOT_PROFILE_SELECT,
  autopilotEligible,
  rewriteDraft,
  type AutopilotProfile,
} from "@/lib/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autopilot/retry { id } — "Try again" on an AutoSparks draft that
 * couldn't be written (2026-11-12). Writes the same topic again in the
 * background; the page watches it finish.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Which draft?" }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: prof }, { data: row }] = await Promise.all([
    admin.from("profiles").select(AUTOPILOT_PROFILE_SELECT).eq("id", user.id).single(),
    admin.from("autopilot_drafts").select("id, user_id, kind, topic, reason, status, source").eq("id", id).single(),
  ]);
  const profile = prof as AutopilotProfile | null;
  const draft = row as { id: string; user_id: string; kind: string; topic: string; reason: string | null; status: string; source: string } | null;
  if (!profile || !draft || draft.user_id !== user.id || draft.source !== "autosparks") {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }
  if (!autopilotEligible(profile)) {
    return NextResponse.json({ error: "AutoSparks is part of the paid plans.", code: "paid_only" }, { status: 403 });
  }
  if (draft.status !== "failed") return NextResponse.json({ error: "This draft is already written." }, { status: 409 });

  // Marked before replying, so the page shows "Writing…" straight away.
  await admin.from("autopilot_drafts").update({ status: "writing" }).eq("id", draft.id);
  waitUntil(rewriteDraft(admin, profile, draft));
  return NextResponse.json({ ok: true });
}
