import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleByRef } from "@/lib/api/social-settle";
import { uploadPostConfigured } from "@/lib/api/upload-post";

/**
 * GET /api/social/status?ref=… (repeatable) — where posts handed to other
 * platforms have got to.
 *
 * The Publish window calls this after it sends, because those posts finish
 * minutes later and a toast that said "posted" at hand-off would be a guess.
 * Each call also settles whatever has finished, so this is the route that
 * still moves a post off "posting" when a webhook never arrives.
 *
 * Only this user's rows are ever read or written: the ref is looked up
 * together with their id, so someone else's ref returns nothing.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const refs = req.nextUrl.searchParams.getAll("ref").filter(Boolean).slice(0, 6);
  if (refs.length === 0 || !uploadPostConfigured()) return NextResponse.json({ posts: [], pending: false });

  const admin = createAdminClient();
  const posts = [];
  for (const ref of refs) {
    try {
      posts.push(...await settleByRef(admin, user.id, ref));
    } catch (err) {
      // A partner hiccup is not news to the agent: the rows stay as they are
      // and the next check, or the webhook, settles them.
      console.error("[social/status] check failed:", err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ posts, pending: posts.some((p) => p.status === "posting") });
}
