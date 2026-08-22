import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextResponse } from "next/server";

/**
 * Photo uploads go straight from the browser to Supabase Storage
 * (lib/utils/upload-photo.ts) — there's no server route in the upload path
 * itself to check the free trial against, unlike every other gated feature.
 * This is that check: called once before each upload starts, so a locked
 * account can't slip photos in through the one path that used to have no
 * gate at all.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  return NextResponse.json({ ok: true });
}
