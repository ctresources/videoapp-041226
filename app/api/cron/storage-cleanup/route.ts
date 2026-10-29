import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * Clears leftover files nobody uses (2026-10-29, the owner's go-ahead).
 *
 * Finished videos and blogs are never touched. Two kinds of leftovers go:
 *
 * - Digital Twin training videos, uploaded in Settings to <user>/camera-recordings/,
 *   30 days after upload. HeyGen keeps its own copy once the twin is trained,
 *   and nothing here reads the file again. (The top-level camera-recordings/
 *   folder is different: those are finished You on camera videos and stay.)
 * - Listen previews (<user>/listen/), 7 days after they were made. They're a
 *   cache: pressing Listen again simply makes a fresh one.
 *
 * ?dry=1 reports what would go without deleting anything.
 * SQL can't delete storage objects, so this goes through the storage API.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RULES = [
  { folder: "camera-recordings", days: 30 },
  { folder: "listen", days: 7 },
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const admin = createAdminClient();
  const bucket = admin.storage.from("assets");

  // Each user's own folder sits at the top of the bucket, named by their id.
  const users: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list("", { limit: 1000, offset });
    if (error) {
      console.error("[cron/storage-cleanup] listing users:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const f of data ?? []) if (UUID.test(f.name)) users.push(f.name);
    if (!data || data.length < 1000) break;
  }

  const report: Record<string, { files: number; mb: number }> = {};
  for (const r of RULES) report[r.folder] = { files: 0, mb: 0 };
  let failed = 0;

  for (const uid of users) {
    for (const rule of RULES) {
      const cutoff = Date.now() - rule.days * 86_400_000;
      const { data } = await bucket.list(`${uid}/${rule.folder}`, { limit: 1000 });
      const old = (data ?? []).filter((f) => f.id && f.created_at && Date.parse(f.created_at) < cutoff);
      if (!old.length) continue;
      let paths = old.map((f) => `${uid}/${rule.folder}/${f.name}`);

      // Belt and braces for the twin folder: never a file a video row points at.
      if (rule.folder === "camera-recordings") {
        const keep = new Set<string>();
        for (const p of paths) {
          const { count } = await admin.from("generated_videos")
            .select("id", { count: "exact", head: true })
            .like("video_url", `%${p}`);
          if (count) keep.add(p);
        }
        paths = paths.filter((p) => !keep.has(p));
      }
      if (!paths.length) continue;

      const mb = old.filter((f) => paths.includes(`${uid}/${rule.folder}/${f.name}`))
        .reduce((n, f) => n + Number((f.metadata as { size?: number } | null)?.size ?? 0), 0) / 1048576;
      if (!dry) {
        const { error } = await bucket.remove(paths);
        if (error) { failed += paths.length; console.error(`[cron/storage-cleanup] ${uid}/${rule.folder}:`, error.message); continue; }
      }
      report[rule.folder].files += paths.length;
      report[rule.folder].mb += mb;
    }
  }

  for (const k of Object.keys(report)) report[k].mb = Math.round(report[k].mb);
  console.log(`[cron/storage-cleanup] ${dry ? "would remove" : "removed"}`, JSON.stringify(report), failed ? `failed=${failed}` : "");
  return NextResponse.json({ dry, users: users.length, removed: report, failed });
}
