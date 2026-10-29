import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/video-email/history — for My Sparks' "✉ Emailed to 3 · Oct 29"
 * line (2026-10-29, the owner's ask): per video, how many people it has been
 * emailed to and when last. Email it and review asks alike. Read with the
 * service role (the table has no read rule for the browser), for the caller's
 * own sends only.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await createAdminClient()
    .from("video_email_sends")
    .select("video_id, sent_to, sent_at")
    .eq("user_id", user.id)
    .not("video_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(500);

  const byVideo: Record<string, { people: number; last: string }> = {};
  for (const s of (data ?? []) as { video_id: string; sent_to: { sent?: boolean }[] | null; sent_at: string }[]) {
    const sent = (s.sent_to ?? []).filter((r) => r?.sent !== false).length;
    const cur = byVideo[s.video_id] ?? { people: 0, last: s.sent_at };
    cur.people += sent;
    if (s.sent_at > cur.last) cur.last = s.sent_at;
    byVideo[s.video_id] = cur;
  }
  return NextResponse.json({ history: byVideo });
}
