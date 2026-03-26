import { createClient } from "@/lib/supabase/server";
import { getTikTokAuthUrl } from "@/lib/api/social/tiktok";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString("base64url");
  return NextResponse.redirect(getTikTokAuthUrl(state));
}
