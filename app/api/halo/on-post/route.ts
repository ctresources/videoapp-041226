import { NextResponse } from "next/server";
import { haloSession } from "@/lib/halo/session";
import { checkOnHaloPosts } from "@/lib/halo/on-post";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/halo/on-post — look now whether posted Halo videos show on their
 * Halo posts (2026-10-26). AutoSparks calls it once when a posted Halo card
 * isn't marked yet, so the card doesn't wait for the morning run.
 */
export async function POST() {
  const s = await haloSession();
  if (!s.ok) return s.response;
  const found = await checkOnHaloPosts(s.admin, s.user.id);
  return NextResponse.json({ found });
}
