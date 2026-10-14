import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The waiting line for video renders (2026-10-14, at the owner's ask).
 *
 * HeyGen runs ten jobs at once for the whole account — every customer's
 * videos, translations and scene clips share them. An eleventh used to be
 * turned away with "try again in a few minutes", and the agent had to come
 * back and press Spark Video again. Now it waits here, in the order it
 * arrived, and /api/cron/render-queue starts it as soon as a slot frees.
 *
 * Nothing is charged while a video waits: the charge comes after HeyGen
 * accepts it, in startRender, exactly as it did when the agent pressed the
 * button themselves.
 *
 * One place per project. Pressing Spark Video again on a video that is
 * already waiting updates what it will render and keeps its place.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface PlaceInLine {
  queueId: string;
  position: number;
}

/** How long a video may wait before the line gives up on it. */
const MAX_WAIT_MS = 3 * 60 * 60 * 1000;
/** A start that never reported back, because the function running it stopped. */
const STALE_START_MS = 6 * 60 * 1000;

async function positionOf(admin: Admin, createdAt: string): Promise<number> {
  const { count } = await admin
    .from("render_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "starting"])
    .lte("created_at", createdAt);
  return Math.max(1, count ?? 1);
}

async function waitingFor(admin: Admin, userId: string, projectId: string) {
  const { data } = await admin
    .from("render_queue")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("status", ["queued", "starting"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { id: string; created_at: string } | null;
}

/** Puts this video in line, or updates the one already waiting for this project. */
export async function joinLine(
  admin: Admin,
  userId: string,
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
): Promise<PlaceInLine | null> {
  const already = await waitingFor(admin, userId, projectId);
  if (already) {
    await admin
      .from("render_queue")
      .update({ body, updated_at: new Date().toISOString() })
      .eq("id", already.id)
      .eq("status", "queued");
    return { queueId: already.id, position: await positionOf(admin, already.created_at) };
  }
  const { data, error } = await admin
    .from("render_queue")
    .insert({ user_id: userId, project_id: projectId, body })
    .select("id, created_at")
    .single();
  if (error || !data) {
    console.error("[render-queue] could not join the line:", error?.message);
    return null;
  }
  const row = data as { id: string; created_at: string };
  console.log(`[render-queue] project=${projectId} joined the line (${row.id})`);
  return { queueId: row.id, position: await positionOf(admin, row.created_at) };
}

/**
 * In line already, or anyone waiting at all: then this waits too.
 *
 * Going straight to HeyGen while others wait would let a newcomer take the
 * slot someone in line has been waiting for.
 */
export async function joinLineIfBusy(
  admin: Admin,
  userId: string,
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>,
): Promise<PlaceInLine | null> {
  if (await waitingFor(admin, userId, projectId)) return joinLine(admin, userId, projectId, body);
  const { count } = await admin
    .from("render_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  if ((count ?? 0) === 0) return null;
  return joinLine(admin, userId, projectId, body);
}

/** Whether anyone is waiting. Scenes make room for them when they are. */
export async function lineIsWaiting(): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { count } = await admin
      .from("render_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Starts what is waiting, oldest first, until HeyGen says it is full again.
 *
 * Strictly in order: if the oldest is not due yet (HeyGen asked for a wait),
 * nobody behind it goes first. Run every minute by the cron; overlapping runs
 * are safe because a video is claimed before it is started.
 */
export async function processRenderQueue(budgetMs = 240_000): Promise<{ started: number; failed: number; waiting: number }> {
  const admin = createAdminClient();
  const now = () => new Date().toISOString();
  const deadline = Date.now() + budgetMs;
  let started = 0;
  let failed = 0;

  await admin
    .from("render_queue")
    .update({ status: "queued", updated_at: now() })
    .eq("status", "starting")
    .lt("updated_at", new Date(Date.now() - STALE_START_MS).toISOString());

  // Imported here, not at the top: start-render imports this file too.
  const { startRender } = await import("@/lib/video/start-render");

  while (Date.now() < deadline) {
    const { data: head } = await admin
      .from("render_queue")
      .select("id, user_id, project_id, body, attempts, next_try_at, created_at")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const next = head as {
      id: string; user_id: string; project_id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: Record<string, any>; attempts: number; next_try_at: string; created_at: string;
    } | null;
    if (!next) break;
    if (new Date(next.next_try_at).getTime() > Date.now()) break;

    if (Date.now() - new Date(next.created_at).getTime() > MAX_WAIT_MS) {
      await admin.from("render_queue").update({
        status: "failed",
        error: "It waited over three hours without a free slot. Press Spark Video to try again; nothing was charged.",
        updated_at: now(),
      }).eq("id", next.id).eq("status", "queued");
      failed += 1;
      continue;
    }

    const { data: claimed } = await admin
      .from("render_queue")
      .update({ status: "starting", attempts: next.attempts + 1, updated_at: now() })
      .eq("id", next.id)
      .eq("status", "queued")
      .select("id");
    if (!claimed?.length) continue;

    const { data: who } = await admin.auth.admin.getUserById(next.user_id);
    let status = 500;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let out: Record<string, any> = {};
    try {
      const res = await startRender({ id: next.user_id, email: who?.user?.email ?? null }, next.body, { queueId: next.id });
      status = res.status;
      out = await res.json().catch(() => ({}));
    } catch (err) {
      out = { error: err instanceof Error ? err.message : "Couldn't start" };
    }

    if (status >= 200 && status < 300 && out.video?.id) {
      await admin.from("render_queue").update({
        status: "started", video_id: out.video.id, error: null, updated_at: now(),
      }).eq("id", next.id);
      console.log(`[render-queue] started ${next.id} → video ${out.video.id}`);
      started += 1;
      continue;
    }

    if (out.code === "at_capacity") {
      // Still full. Back to the front of the line, after the wait HeyGen asked for.
      const wait = Math.max(60, Number(out.retryAfterSeconds) || 60);
      await admin.from("render_queue").update({
        status: "queued",
        next_try_at: new Date(Date.now() + wait * 1000).toISOString(),
        updated_at: now(),
      }).eq("id", next.id);
      break;
    }

    // Anything else will not come right by waiting: out of videos since, a
    // project deleted, a voice gone. Said in the words the route already wrote.
    await admin.from("render_queue").update({
      status: "failed",
      error: typeof out.error === "string" && out.error ? out.error : `Couldn't start (${status}). Press Spark Video to try again.`,
      updated_at: now(),
    }).eq("id", next.id);
    console.warn(`[render-queue] ${next.id} could not start (${status}): ${out.error ?? ""}`);
    failed += 1;
  }

  const { count } = await admin
    .from("render_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued");
  return { started, failed, waiting: count ?? 0 };
}
