import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessLevel, isPaidLevel } from "@/lib/access";
import { emailConfigured, sendAccountCleanupWarning } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

/**
 * Removes the videos and uploads of accounts that left (2026-10-29, the
 * owner's go-ahead). Paying accounts and admins/staff are never touched.
 *
 * - A free account quiet for 6 months (last sign-in, video or project).
 * - A canceled account 90 days after its plan ended, or its last use if later.
 *
 * Each gets an email 30 days before and another 7 days before; nothing is
 * removed without both. Opening SparkReels in between keeps everything
 * (the allowance route notes last_active_at), as does a paid plan or new activity.
 * What goes: their videos (rows and files) and uploaded photos, b-roll and
 * recordings. What stays: the account, blog posts, settings, logo and
 * twin backgrounds.
 *
 * ?dry=1 reports what it would do without emailing or deleting.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DAY = 86_400_000;
const FREE_QUIET_DAYS = 180;
const CANCELED_DAYS = 90;
/** Removed per run at most, so one run never runs out of time. */
const MAX_CLEAN = 10;
const APP = (process.env.NEXT_PUBLIC_APP_URL || "https://www.sparkreels.ai").replace(/\/$/, "");
const STORAGE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

type Admin = ReturnType<typeof createAdminClient>;
interface Profile {
  id: string; email: string | null; full_name: string | null; role: string | null;
  subscription_tier: string | null; stripe_subscription_id: string | null;
  current_period_end: string | null; updated_at: string | null; created_at: string | null;
  last_active_at: string | null;
}
interface Row {
  user_id: string; reason: "inactive_free" | "canceled"; due_at: string;
  warned_30_at: string | null; warned_7_at: string | null; cleaned_at: string | null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  // Never remove anything without being able to warn first.
  if (!emailConfigured() && !dry) return NextResponse.json({ skipped: "email not configured" });

  const admin = createAdminClient();
  const now = Date.now();

  const { data: profData, error } = await admin.from("profiles")
    .select("id, email, full_name, role, subscription_tier, stripe_subscription_id, current_period_end, updated_at, created_at, last_active_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const profiles = (profData ?? []) as Profile[];

  // Last sign-in, from auth.
  const lastSignIn = new Map<string, number>();
  for (let page = 1; ; page++) {
    const { data, error: e } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    for (const u of data.users) if (u.last_sign_in_at) lastSignIn.set(u.id, Date.parse(u.last_sign_in_at));
    if (data.users.length < 1000) break;
  }

  // Newest video and project per account, and how many videos.
  const lastMade = new Map<string, number>();
  const videoCount = new Map<string, number>();
  for (const table of ["generated_videos", "projects"] as const) {
    for (let from = 0; ; from += 1000) {
      const { data } = await admin.from(table).select("user_id, created_at").range(from, from + 999);
      const rows = (data ?? []) as { user_id: string; created_at: string }[];
      for (const r of rows) {
        const t = Date.parse(r.created_at);
        if (t > (lastMade.get(r.user_id) ?? 0)) lastMade.set(r.user_id, t);
        if (table === "generated_videos") videoCount.set(r.user_id, (videoCount.get(r.user_id) ?? 0) + 1);
      }
      if (rows.length < 1000) break;
    }
  }

  const { data: rowData } = await admin.from("account_cleanup").select("*");
  const rows = new Map(((rowData ?? []) as Row[]).map((r) => [r.user_id, r]));

  const log: string[] = [];
  let cleaned = 0;

  for (const p of profiles) {
    const level = getAccessLevel(p);
    // Beta testers are kept too: their access was given, not bought.
    const keep = level === "admin" || isPaidLevel(level) || p.subscription_tier === "beta";
    const lastActive = Math.max(
      lastSignIn.get(p.id) ?? 0, lastMade.get(p.id) ?? 0,
      Date.parse(p.last_active_at ?? "") || 0, Date.parse(p.created_at ?? "") || 0,
    );
    const row = rows.get(p.id);

    // Paying again, or back since the first warning (or since a past cleanup): start over.
    if (row && (keep
      || (!row.cleaned_at && row.warned_30_at && lastActive > Date.parse(row.warned_30_at))
      || (row.cleaned_at && lastActive > Date.parse(row.cleaned_at)))) {
      if (!dry) await admin.from("account_cleanup").delete().eq("user_id", p.id);
      log.push(`${p.id}: reset`);
      continue;
    }
    if (keep || !p.email || row?.cleaned_at) continue;

    // Only accounts with something to remove.
    const videos = videoCount.get(p.id) ?? 0;
    if (!row && videos === 0 && !(await hasUploads(admin, p.id))) continue;

    const canceled = !!p.stripe_subscription_id || !!p.current_period_end;
    const reason: Row["reason"] = canceled ? "canceled" : "inactive_free";
    const planEnd = Date.parse(p.current_period_end ?? p.updated_at ?? "") || lastActive;
    const due = canceled
      ? Math.max(planEnd + CANCELED_DAYS * DAY, lastActive + CANCELED_DAYS * DAY)
      : lastActive + FREE_QUIET_DAYS * DAY;

    if (!row) {
      if (now < due - 30 * DAY) continue;
      // Always a full 30 days from the first warning.
      const dueAt = new Date(Math.max(due, now + 30 * DAY)).toISOString();
      log.push(`${p.id}: warn 30 (${reason}, due ${dueAt.slice(0, 10)}, ${videos} videos)`);
      if (dry) continue;
      const sent = await sendAccountCleanupWarning({ email: p.email, name: p.full_name, daysLeft: 30, dueAt, videos, reason, appUrl: APP });
      if (sent) {
        await admin.from("account_cleanup").insert({ user_id: p.id, reason, due_at: dueAt, warned_30_at: new Date().toISOString() });
      }
      continue;
    }

    const dueAt = Date.parse(row.due_at);
    if (!row.warned_7_at) {
      if (now < dueAt - 7 * DAY) continue;
      // A full 7 days after this one, even if it goes out late.
      const newDue = new Date(Math.max(dueAt, now + 7 * DAY)).toISOString();
      log.push(`${p.id}: warn 7 (due ${newDue.slice(0, 10)})`);
      if (dry) continue;
      const sent = await sendAccountCleanupWarning({ email: p.email, name: p.full_name, daysLeft: 7, dueAt: newDue, videos, reason: row.reason, appUrl: APP });
      if (sent) await admin.from("account_cleanup").update({ warned_7_at: new Date().toISOString(), due_at: newDue }).eq("user_id", p.id);
      continue;
    }

    if (now < dueAt || cleaned >= MAX_CLEAN) continue;
    log.push(`${p.id}: clean`);
    if (dry) continue;
    const files = await removeAccountFiles(admin, p.id);
    await admin.from("account_cleanup").update({ cleaned_at: new Date().toISOString(), cleaned_files: files }).eq("user_id", p.id);
    cleaned++;
  }

  console.log(`[cron/account-cleanup] ${dry ? "dry run" : "done"}:`, log.join(" | ") || "nothing to do");
  return NextResponse.json({ dry, actions: log });
}

/** Whether the account has anything of its own in storage. */
async function hasUploads(admin: Admin, uid: string): Promise<boolean> {
  const { data } = await admin.storage.from("assets").list(uid, { limit: 20 });
  return (data ?? []).some((f) => !f.id || !/^logo/i.test(f.name));
}

/** Every file path under a folder, however deep. */
async function listAll(admin: Admin, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    const items = data ?? [];
    for (const f of items) {
      const path = `${folder}/${f.name}`;
      if (f.id) out.push(path);
      else out.push(...await listAll(admin, bucket, path));
    }
    if (items.length < 1000) break;
  }
  return out;
}

/** Removes the account's videos and uploads; returns how many files went. */
async function removeAccountFiles(admin: Admin, uid: string): Promise<number> {
  const byBucket: Record<string, string[]> = {};
  const add = (bucket: string, path: string) => {
    const list = (byBucket[bucket] ??= []);
    if (!list.includes(path)) list.push(path);
  };

  // Each video's own file, wherever it lives, then the rows.
  const { data: vids } = await admin.from("generated_videos").select("id, video_url").eq("user_id", uid);
  for (const v of (vids ?? []) as { id: string; video_url: string | null }[]) {
    if (v.video_url?.startsWith(STORAGE_PREFIX)) {
      const rest = v.video_url.slice(STORAGE_PREFIX.length).split("?")[0];
      const i = rest.indexOf("/");
      if (i > 0) add(rest.slice(0, i), decodeURIComponent(rest.slice(i + 1)));
    }
  }

  // Their folders: videos/<uid>, assets/camera-recordings/<uid>, and
  // assets/<uid> apart from the logo and twin backgrounds.
  for (const p of await listAll(admin, "videos", uid)) add("videos", p);
  for (const p of await listAll(admin, "assets", `camera-recordings/${uid}`)) add("assets", p);
  for (const p of await listAll(admin, "assets", uid)) {
    const rel = p.slice(uid.length + 1);
    if (/^logo/i.test(rel) || rel.startsWith("twin-bg/")) continue;
    add("assets", p);
  }

  let n = 0;
  for (const bucket of Object.keys(byBucket)) {
    const paths = byBucket[bucket];
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) console.error(`[cron/account-cleanup] ${uid} ${bucket}:`, error.message);
      else n += chunk.length;
    }
  }
  await admin.from("generated_videos").delete().eq("user_id", uid);
  return n;
}
