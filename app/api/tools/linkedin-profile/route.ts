import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { writeLinkedInProfile, type LinkedInInput } from "@/lib/api/linkedin-profile";
import { NextRequest, NextResponse } from "next/server";

// Two model calls at most: the draft, and one rewrite of any field that ran
// over its LinkedIn limit. Each can take up to 50s (perplexityChat's timeout).
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const input = await req.json() as LinkedInInput;
  if (!input.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const profile = await writeLinkedInProfile(input);
  if (!profile) {
    return NextResponse.json({ error: "Could not write your profile. Please try again." }, { status: 502 });
  }
  return NextResponse.json(profile);
}
