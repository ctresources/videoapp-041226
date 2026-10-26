import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sparklee's one-line notes (2026-10-26, usability sweep #12), shown at the
 * top of My Sparks.
 *
 * "fixed": something broke and the app repaired it by itself.
 * "needs": only the agent can do it; the note carries the button for it.
 *
 * A dedupe key keeps one note per problem. Never throws.
 */
export async function addSparkleeNote(admin: SupabaseClient, note: {
  userId: string;
  kind: "fixed" | "needs";
  title: string;
  body?: string | null;
  actionLabel?: string | null;
  actionHref?: string | null;
  projectId?: string | null;
  videoId?: string | null;
  dedupeKey?: string | null;
}): Promise<void> {
  try {
    const { error } = await admin.from("sparklee_notes").insert({
      user_id: note.userId,
      kind: note.kind,
      title: note.title.slice(0, 200),
      body: note.body?.slice(0, 600) ?? null,
      action_label: note.actionLabel ?? null,
      action_href: note.actionHref ?? null,
      project_id: note.projectId ?? null,
      video_id: note.videoId ?? null,
      dedupe_key: note.dedupeKey ?? null,
    });
    if (error && !/duplicate|unique/i.test(error.message)) console.error("[sparklee-notes]", error.message);
  } catch (err) {
    console.error("[sparklee-notes]", err instanceof Error ? err.message : err);
  }
}
