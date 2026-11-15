import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { geminiKey } from "@/lib/api/gemini";
import {
  STAGE_STYLES, TOUCHUP_MODES, TOUCHUP_MONTHLY_LIMIT, touchUpPhoto, type TouchupMode,
} from "@/lib/utils/photo-touchup";

/**
 * Photo Touch-Up (2026-11-15, the owner's approved plan, #6).
 *
 *   GET                         { left, limit, ready }
 *   POST { imageUrl, mode, style?, label? }  → { url, left }
 *   POST { action: "save", projectId, url, replace? } → adds the edited photo
 *        to that listing's photos (in place of `replace` when given)
 *
 * Paid plans only (middleware), 30 edits a month; admins aren't limited.
 */

export const maxDuration = 120;

function monthStart(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function publicHttps(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return null;
    if (/^(10|127|0)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return u;
  } catch {
    return null;
  }
}

async function session() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("subscription_tier, role").eq("id", user.id).single();
  const level = getAccessLevel(prof as never);
  return { user, admin, level };
}

async function used(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { count } = await admin.from("photo_edits").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", monthStart());
  return count ?? 0;
}

export async function GET() {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const paid = isPaidLevel(s.level);
  const n = await used(s.admin, s.user.id);
  const unlimited = s.level === "admin";
  return NextResponse.json({
    ready: !!geminiKey() && paid,
    paid,
    limit: unlimited ? null : TOUCHUP_MONTHLY_LIMIT,
    left: unlimited ? null : Math.max(0, TOUCHUP_MONTHLY_LIMIT - n),
  });
}

export async function POST(req: NextRequest) {
  const s = await session();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPaidLevel(s.level)) {
    return NextResponse.json({ error: "This comes with a SparkReels plan. See plans in Settings → Billing.", code: "paid_plan_required" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; imageUrl?: string; mode?: string; style?: string; label?: boolean;
    projectId?: string; url?: string; replace?: string;
  };

  // Save an edited photo into a listing's photos.
  if (body.action === "save") {
    if (!body.projectId || !body.url || !publicHttps(body.url)) {
      return NextResponse.json({ error: "Pick a listing first." }, { status: 400 });
    }
    const { data: project } = await s.admin.from("projects").select("id, listing_data")
      .eq("id", body.projectId).eq("user_id", s.user.id).maybeSingle();
    if (!project) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    const ld = { ...((project.listing_data ?? {}) as Record<string, unknown>) };
    const photos = Array.isArray(ld.photoUrls) ? (ld.photoUrls as unknown[]).filter((u): u is string => typeof u === "string") : [];
    const at = body.replace ? photos.indexOf(body.replace) : -1;
    if (at >= 0) photos[at] = body.url;
    else if (!photos.includes(body.url)) photos.push(body.url);
    ld.photoUrls = photos;
    const { error } = await s.admin.from("projects").update({ listing_data: ld }).eq("id", project.id);
    if (error) return NextResponse.json({ error: "Couldn't save it to the listing." }, { status: 500 });
    return NextResponse.json({ photoUrls: photos });
  }

  const mode = body.mode as TouchupMode;
  if (!TOUCHUP_MODES.includes(mode)) return NextResponse.json({ error: "Pick what to do." }, { status: 400 });
  const style = (STAGE_STYLES as readonly string[]).includes(body.style ?? "") ? (body.style as string) : "Modern";
  const src = publicHttps(body.imageUrl ?? "");
  if (!src) return NextResponse.json({ error: "Pick a photo first." }, { status: 400 });
  if (!geminiKey()) return NextResponse.json({ error: "Photo Touch-Up isn't available right now." }, { status: 503 });

  const unlimited = s.level === "admin";
  const n = await used(s.admin, s.user.id);
  if (!unlimited && n >= TOUCHUP_MONTHLY_LIMIT) {
    return NextResponse.json({ error: `You've used all ${TOUCHUP_MONTHLY_LIMIT} touch-ups this month. More on the 1st.` }, { status: 429 });
  }

  let source: Buffer;
  try {
    const res = await fetch(src.toString(), { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(String(res.status));
    source = Buffer.from(await res.arrayBuffer());
    if (source.length > 25 * 1024 * 1024) throw new Error("too large");
  } catch {
    return NextResponse.json({ error: "Couldn't open that photo. Try uploading it." }, { status: 400 });
  }

  const edited = await touchUpPhoto(source, mode, style, body.label !== false).catch((e) => {
    console.error("[photo-touchup] failed:", e instanceof Error ? e.message : e);
    return null;
  });
  if (!edited) return NextResponse.json({ error: "Couldn't touch up this photo. Try again." }, { status: 502 });

  const filePath = `photo-edits/${s.user.id}/${Date.now()}-${mode}.jpg`;
  const { error: upErr } = await s.admin.storage.from("assets").upload(filePath, edited, { contentType: "image/jpeg", upsert: false });
  if (upErr) return NextResponse.json({ error: "Couldn't save the photo." }, { status: 500 });
  const url = s.admin.storage.from("assets").getPublicUrl(filePath).data.publicUrl;
  await s.admin.from("photo_edits").insert({ user_id: s.user.id, kind: mode, source_url: src.toString(), result_url: url });

  return NextResponse.json({ url, left: unlimited ? null : Math.max(0, TOUCHUP_MONTHLY_LIMIT - n - 1) });
}
