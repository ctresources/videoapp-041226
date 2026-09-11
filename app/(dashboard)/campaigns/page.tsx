import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";
import { CampaignCalendar } from "@/components/campaigns/campaign-calendar";

export const dynamic = "force-dynamic";

/**
 * The campaign calendar, still being built.
 *
 * Not in the navigation, and served only to accounts granted it in
 * feature_access. Everyone else gets the ordinary 404, so the page does not
 * advertise itself while it is unfinished.
 */
export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasFeature(user.id, CAMPAIGN_CALENDAR))) notFound();

  return <CampaignCalendar />;
}
