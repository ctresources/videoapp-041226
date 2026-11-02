import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { haloSession } from "@/lib/halo/session";
import { startSparkleeDraft } from "@/lib/halo/sparklee";
import { featureTopics, isSparkreelsMode } from "@/lib/sparkreels-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Feature videos on AutoSparks (2026-11-01, SparkReels mode): one ready idea
 * per SparkReels feature, newest updates first.
 *
 * GET           the features, each with its latest draft if one was made
 * POST { id }   Make draft: the script and blog are written and the draft
 *               waits in Needs Your Approval. No video is made or charged
 *               until Make video, and nothing posts until Approve.
 */
type Made = { source_kind: string; created_at: string; status: string };

export async function GET() {
  const s = await haloSession();
  if (!s.ok) return s.response;
  if (!(await isSparkreelsMode(s.user.id))) return NextResponse.json({ features: [] });
  const { data } = await s.admin.from("autopilot_drafts")
    .select("source_kind, created_at, status")
    .eq("user_id", s.user.id).like("source_kind", "feature:%").neq("status", "skipped")
    .order("created_at", { ascending: false });
  const made = new Map<string, Made>();
  for (const r of (data ?? []) as Made[]) {
    const id = r.source_kind.slice("feature:".length);
    if (!made.has(id)) made.set(id, r);
  }
  return NextResponse.json({
    features: featureTopics().map((f) => ({
      id: f.id, title: f.title, blurb: f.blurb, isNew: f.isNew,
      draftAt: made.get(f.id)?.created_at ?? null,
      status: made.get(f.id)?.status ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const s = await haloSession();
  if (!s.ok) return s.response;
  if (!(await isSparkreelsMode(s.user.id))) return NextResponse.json({ error: "Not on for this account." }, { status: 403 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const f = featureTopics().find((x) => x.id === id);
  if (!f) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });

  const started = await startSparkleeDraft(s.admin, s.user, s.profile, {
    words: "", topic: f.topic, city: "", state: "",
  }, { makeVideo: false });
  if (!started) return NextResponse.json({ error: "Couldn't start that. Try again." }, { status: 500 });
  // Which feature it is, for "✓ Draft made" on the list.
  await s.admin.from("autopilot_drafts").update({ source_kind: `feature:${f.id}` }).eq("id", started.draftId);
  waitUntil(started.work);
  return NextResponse.json({ draftId: started.draftId, slotAt: started.slotAt });
}
