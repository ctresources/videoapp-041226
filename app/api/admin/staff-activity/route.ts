import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile, profileUsername, uploadPostConfigured } from "@/lib/api/upload-post";
import { partnerPlatform } from "@/lib/utils/social-platforms";
import { staffVideosThisMonth } from "@/lib/utils/roles";
import { cleanPermissions } from "@/lib/staff/staff";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Admin → Staff activity (2026-10-30, the owner's ask; admins only).
 *
 * GET  ?month=YYYY-MM — every staff account's month: what they made, where it
 *      posted (and to which account), emails sent (counts, never addresses),
 *      blogs, Spark Tools and Sparklee use, and flags.
 * POST { userId, permissions?, cap? } — set one staff member's access.
 */

const DAY = 86_400_000;
const label = (p: string) => (p === "youtube" ? "YouTube" : partnerPlatform(p)?.label ?? p);

async function adminOnly() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role, time_zone").eq("id", user.id).single();
  const p = data as { role: string | null; time_zone: string | null } | null;
  return p?.role === "admin" ? { id: user.id, tz: p.time_zone || "America/New_York" } : null;
}

function videoKind(v: { render_provider: string | null; metadata: Record<string, unknown> | null; ai_kind?: string | null }) {
  const m = v.metadata ?? {};
  if (m.is_podcast) return "Spark Podcast";
  if (v.ai_kind === "agent_intro") return "Agent Intro";
  if (v.render_provider === "camera") return m.source === "screen" ? "Screen recording" : "Camera recording";
  if (v.render_provider === "ffmpeg") return m.source === "scenes-reel" ? "Scenes reel" : m.motion ? "Cinematic reel" : "Classic photo reel";
  if (v.render_provider === "heygen_agent") return "Avatar video";
  if (v.render_provider === "heygen_v3_direct") return m.twin_cutout ? "Avatar on footage" : m.twin_backdrop ? "Avatar on background" : "Avatar in circle";
  if (v.render_provider?.includes("translate")) return "Translation";
  return "Video";
}

export async function GET(req: NextRequest) {
  const me = await adminOnly();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const admin = createAdminClient();
  const month = /^\d{4}-\d{2}$/.test(req.nextUrl.searchParams.get("month") ?? "") ? req.nextUrl.searchParams.get("month")! : new Date().toISOString().slice(0, 7);
  const from = new Date(`${month}-01T00:00:00Z`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));

  const { data: staffRows } = await admin.from("profiles")
    .select("id, full_name, email, time_zone, last_active_at, staff_video_cap, staff_permissions, youtube_channel_name, youtube_channel_id, social_profile_created_at, created_at")
    .eq("role", "staff").order("full_name");
  type S = { id: string; full_name: string | null; email: string | null; time_zone: string | null; last_active_at: string | null; staff_video_cap: number | null; staff_permissions: unknown; youtube_channel_name: string | null; youtube_channel_id: string | null; social_profile_created_at: string | null; created_at: string };
  const staff = (staffRows ?? []) as S[];
  const { data: invites } = await admin.from("staff_invites").select("email, video_cap, created_at").is("used_at", null);

  const people = await Promise.all(staff.map(async (s) => {
    const fromIso = from.toISOString(), toIso = to.toISOString();
    const [vids, posts, emails, sellerSends, blogs, tools, usage, images, cardEvents, autoApproved, used] = await Promise.all([
      admin.from("generated_videos").select("id, created_at, render_provider, render_status, video_url, metadata, projects(title, ai_script)")
        .eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: false }).limit(200),
      admin.from("social_posts").select("video_id, platform, post_status, posted_at, scheduled_at, post_url, platform_post_id, video_title, created_at")
        .eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).limit(500),
      admin.from("video_email_sends").select("kind, subject, sent_to, sent_at, video_id").eq("user_id", s.id).gte("sent_at", fromIso).lt("sent_at", toIso).limit(200),
      admin.from("seller_listing_updates").select("sent_at, sent_to").eq("user_id", s.id).gte("sent_at", fromIso).lt("sent_at", toIso).limit(200),
      admin.from("projects").select("id, title, created_at, ai_script").eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).limit(300),
      admin.from("activity_log").select("kind").eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).limit(2000),
      admin.from("api_usage_log").select("endpoint, credits_used").eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).in("endpoint", ["ask_sparklee", "ask_sparklee_seconds", "listen", "import-article", "blog-moving-header", "blog-teaser"]).limit(2000),
      admin.from("generated_images").select("id", { count: "exact", head: true }).eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso),
      admin.from("business_card_events").select("kind").eq("user_id", s.id).gte("created_at", fromIso).lt("created_at", toIso).limit(5000),
      admin.from("autopilot_drafts").select("id", { count: "exact", head: true }).eq("user_id", s.id).gte("approved_at", fromIso).lt("approved_at", toIso),
      staffVideosThisMonth(admin as never, s.id),
    ]);
    const { data: timeRows } = await admin.from("app_time_daily").select("seconds, last_seen")
      .eq("user_id", s.id).gte("day", fromIso.slice(0, 10)).lt("day", toIso.slice(0, 10));
    const tr = (timeRows ?? []) as { seconds: number; last_seen: string }[];
    const minutesInApp = Math.round(tr.reduce((n, r) => n + r.seconds, 0) / 60);
    const daysInApp = tr.filter((r) => r.seconds > 0).length;
    const lastSeen = tr.map((r) => r.last_seen).sort().pop() ?? null;

    // Account names for "Posted to".
    const names: Record<string, string> = {};
    if (s.youtube_channel_id) names.youtube = s.youtube_channel_name || "YouTube channel";
    if (s.social_profile_created_at && uploadPostConfigured()) {
      try {
        const accts = (await getProfile(profileUsername(s.id)))?.social_accounts ?? {};
        for (const [k, v] of Object.entries(accts)) {
          if (v && typeof v === "object") names[k] = v.display_name || v.handle || v.username || label(k);
        }
      } catch { /* names fall back to the platform */ }
    }
    const perms = cleanPermissions(s.staff_permissions);

    type P = { video_id: string | null; platform: string; post_status: string; posted_at: string | null; scheduled_at: string | null; post_url: string | null; platform_post_id: string | null; video_title: string | null };
    const postRows = (posts.data ?? []) as P[];
    type E = { kind: string | null; subject: string | null; sent_to: unknown; sent_at: string; video_id: string | null };
    const emailRows = (emails.data ?? []) as E[];
    const people = (x: unknown) => (Array.isArray(x) ? x.filter((r) => !(r && typeof r === "object" && (r as { sent?: boolean }).sent === false)).length : 0);
    const emailedVideo = new Set(emailRows.map((e) => e.video_id).filter(Boolean));

    type V = { id: string; created_at: string; render_provider: string | null; render_status: string | null; video_url: string | null; metadata: Record<string, unknown> | null; projects: { title: string | null; ai_script: { kind?: string } | null } | null };
    const videos = ((vids.data ?? []) as unknown as V[]).map((v) => {
      const kind = videoKind({ ...v, ai_kind: v.projects?.ai_script?.kind ?? null });
      const free = v.render_provider === "camera" || kind === "Classic photo reel";
      const vp = postRows.filter((p) => p.video_id === v.id && p.post_status !== "failed");
      return {
        id: v.id, title: v.projects?.title || "Untitled", kind, at: v.created_at, url: v.video_url,
        status: v.render_status, counted: !free && v.render_status !== "failed",
        posts: vp.map((p) => ({
          platform: label(p.platform), account: names[p.platform] ?? label(p.platform), status: p.post_status,
          url: p.post_url || (p.platform === "youtube" && p.platform_post_id ? `https://www.youtube.com/watch?v=${p.platform_post_id}` : null),
          approved: perms.publish === "any" ? null : perms.approved.includes(p.platform),
          platformId: p.platform,
        })),
        emailed: emailedVideo.has(v.id),
      };
    });

    type B = { id: string; title: string | null; created_at: string; ai_script: { blog_body?: string; kind?: string } | null };
    const blogRows = ((blogs.data ?? []) as B[]).filter((b) => !!b.ai_script?.blog_body);
    const count = <T,>(rows: T[] | null, pick: (r: T) => string) => {
      const out: Record<string, number> = {};
      for (const r of rows ?? []) { const k = pick(r); out[k] = (out[k] ?? 0) + 1; }
      return out;
    };
    const toolCounts = count((tools.data ?? []) as { kind: string }[], (r) => r.kind.replace(/^tool:/, ""));
    const usageRows = (usage.data ?? []) as { endpoint: string; credits_used: number | null }[];
    const kinds = count(videos, (v) => v.kind);
    const emailsByKind = emailRows.map((e) => ({ kind: e.kind === "review" ? "Review request" : e.kind === "blog" ? "Blog email" : e.kind === "newsletter" ? "Newsletter" : "Email it", subject: e.subject, people: people(e.sent_to), at: e.sent_at }));
    for (const r of (sellerSends.data ?? []) as { sent_at: string; sent_to: unknown }[]) emailsByKind.push({ kind: "Seller update", subject: null, people: people(r.sent_to), at: r.sent_at });

    // Flags.
    const flags: { level: "red" | "amber" | "grey"; text: string; videoId?: string; platform?: string }[] = [];
    for (const v of videos) for (const p of v.posts) {
      if (p.approved === false) flags.push({ level: "red", text: `posted "${v.title}" to ${p.platform} · ${p.account}, which isn't approved for them`, videoId: v.id, platform: p.platformId });
    }
    const unused = videos.filter((v) => v.status === "completed" && !v.posts.length && !v.emailed && Date.now() - Date.parse(v.at) > 2 * DAY);
    if (unused.length) flags.push({ level: "amber", text: `made ${unused.length} video${unused.length === 1 ? "" : "s"} that weren't posted or emailed anywhere` });
    const cap = s.staff_video_cap ?? 10;
    if (used >= cap) flags.push({ level: "grey", text: `has used ${used} of ${cap} videos this month` });
    if (!s.last_active_at || Date.now() - Date.parse(s.last_active_at) > 30 * DAY) flags.push({ level: "grey", text: "hasn't opened SparkReels in 30 days" });

    const cards = count((cardEvents.data ?? []) as { kind: string }[], (r) => r.kind);
    return {
      id: s.id, name: s.full_name || s.email || "Staff", email: s.email, timeZone: s.time_zone,
      lastActive: [lastSeen, s.last_active_at].filter(Boolean).sort().pop() ?? null, minutesInApp, daysInApp,
      cap, used, permissions: perms, accounts: Object.entries(names).map(([platform, account]) => ({ platform, label: label(platform), account })),
      totals: { videos: videos.length, posts: postRows.filter((p) => p.post_status !== "failed").length, emails: emailsByKind.length, approvals: autoApproved.count ?? 0 },
      everything: {
        Videos: kinds,
        "Blogs & writing": {
          "Blog posts": blogRows.length,
          "Moving blog headers": usageRows.filter((u) => u.endpoint === "blog-moving-header").length,
          "Blog teasers": usageRows.filter((u) => u.endpoint === "blog-teaser").length,
          "Articles imported": usageRows.filter((u) => u.endpoint === "import-article").length,
          "Listen (read aloud)": usageRows.filter((u) => u.endpoint === "listen").length,
        },
        Emails: count(emailsByKind, (e) => e.kind),
        "Spark Tools": { ...Object.fromEntries(Object.entries(toolCounts).map(([k, n]) => [k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), n])), "AI images": images.count ?? 0 },
        Sparklee: {
          "Questions asked": usageRows.filter((u) => u.endpoint === "ask_sparklee").length,
          "Minutes talked": Math.round(usageRows.filter((u) => u.endpoint === "ask_sparklee_seconds").reduce((n, u) => n + Number(u.credits_used ?? 0), 0) / 60),
        },
        "Business card": { Opens: cards.open ?? 0, "Contact saves": cards.save ?? 0, Taps: (cards.call ?? 0) + (cards.text ?? 0) + (cards.email ?? 0) + (cards.book ?? 0) },
      },
      videos, emails: emailsByKind.sort((a, b) => b.at.localeCompare(a.at)), flags,
    };
  }));

  return NextResponse.json({ month, ownerTimeZone: me.tz, staff: people, invites: invites ?? [] });
}

export async function POST(req: NextRequest) {
  const me = await adminOnly();
  if (!me) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { userId?: string; permissions?: unknown; cap?: number };
  const admin = createAdminClient();
  const { data: row } = await admin.from("profiles").select("role").eq("id", b.userId ?? "").single();
  if ((row as { role: string | null } | null)?.role !== "staff") return NextResponse.json({ error: "Not a staff account." }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.permissions !== undefined) patch.staff_permissions = cleanPermissions(b.permissions);
  if (b.cap !== undefined) {
    if (!Number.isInteger(b.cap) || b.cap < 0 || b.cap > 500) return NextResponse.json({ error: "Cap must be 0 to 500." }, { status: 400 });
    patch.staff_video_cap = b.cap;
  }
  const { error } = await admin.from("profiles").update(patch).eq("id", b.userId!);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
