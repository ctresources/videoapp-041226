import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";

/**
 * Signed in, and granted the campaign calendar.
 *
 * Anyone else gets the same 404 the page gives, so the API does not reveal
 * that the feature exists either.
 */
export async function requireCampaignUser(): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await hasFeature(user.id, CAMPAIGN_CALENDAR))) {
    return { response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { userId: user.id };
}
