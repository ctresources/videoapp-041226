import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { channelPhoneVerified, getValidAccessToken } from "@/lib/api/youtube";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/social/youtube/verified — { verified: true | false | null }
 *
 * Whether the connected channel is phone-verified, which is what YouTube
 * requires before it will take a custom thumbnail. The settings pages showed
 * "Verify your channel" to everyone, verified or not, because nothing asked;
 * the owner verified hers and the note stayed (2026-10-13).
 *
 * null means not known: no channel, a connection that has to be made again,
 * or YouTube not answering. The pages keep the note in that case, so nobody
 * loses the warning by mistake.
 *
 * Its own route rather than part of /api/social/accounts, which the Publish
 * window reads on every open and which should not wait on YouTube.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const token = await getValidAccessToken(user.id, createAdminClient());
    const { verified, raw } = await channelPhoneVerified(token);
    console.log(`[youtube/verified] user=${user.id} longUploadsStatus=${raw ?? "none"}`);
    return NextResponse.json({ verified });
  } catch (err) {
    console.log("[youtube/verified] not known:", err instanceof Error ? err.message : err);
    return NextResponse.json({ verified: null });
  }
}
