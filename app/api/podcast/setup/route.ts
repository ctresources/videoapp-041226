import { NextResponse } from "next/server";
import { podcastSession } from "@/lib/podcast/session";
import { listCoHosts, PODCAST_SHORT_VIDEOS, STUDIO_SETS } from "@/lib/podcast/podcast";
import { ALLOWANCE_SELECT, availableFor } from "@/lib/utils/video-allowance";
import { hasAdminPerks } from "@/lib/utils/roles";

export const dynamic = "force-dynamic";

/** GET /api/podcast/setup — co-hosts, studio sets, recent Sparks and videos left. */
export async function GET() {
  const s = await podcastSession();
  if (!s.ok) return s.response;
  const [coHosts, { data: prof }, { data: projects }] = await Promise.all([
    listCoHosts().catch(() => []),
    s.admin.from("profiles").select(`${ALLOWANCE_SELECT}, full_name, location_city, location_state, role`).eq("id", s.user.id).single(),
    s.admin.from("projects").select("id, title, created_at, ai_script").eq("user_id", s.user.id)
      .order("created_at", { ascending: false }).limit(30),
  ]);
  const p = prof as { full_name: string | null; location_city: string | null; location_state: string | null; role: string | null } | null;
  type Proj = { id: string; title: string | null; created_at: string; ai_script: { blog_body?: string; script?: string; kind?: string } | null };
  const sparks = ((projects ?? []) as Proj[])
    .filter((x) => (x.ai_script?.blog_body || x.ai_script?.script) && x.ai_script?.kind !== "podcast")
    .slice(0, 20).map((x) => ({ id: x.id, title: x.title || "Untitled", createdAt: x.created_at }));
  const sets = STUDIO_SETS.map((x) => ({
    id: x.id, label: x.label,
    url: s.admin.storage.from("assets").getPublicUrl(`podcast-sets/${x.id}.png`).data.publicUrl,
  }));
  return NextResponse.json({
    coHosts, sets, sparks,
    name: p?.full_name ?? null, city: p?.location_city ?? null, state: p?.location_state ?? null,
    videosLeft: hasAdminPerks(p?.role) ? null : availableFor(prof as never, "short"),
    cost: PODCAST_SHORT_VIDEOS,
  });
}
