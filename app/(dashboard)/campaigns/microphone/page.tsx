import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";
import { MicrophoneCheck } from "@/components/campaigns/microphone-check";

export const dynamic = "force-dynamic";

/**
 * Camera and Microphone settings, still being built.
 *
 * Behind the same switch as the Spark Calendar so it can be tried on real
 * phones and headsets before any production recording screen depends on it.
 * Everyone else gets the ordinary 404.
 */
export default async function MicrophonePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasFeature(user.id, CAMPAIGN_CALENDAR))) notFound();

  return <MicrophoneCheck />;
}
