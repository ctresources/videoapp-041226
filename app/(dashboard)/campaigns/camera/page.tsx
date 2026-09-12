import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { CAMPAIGN_CALENDAR, hasFeature } from "@/lib/utils/feature-access";
import { CameraWithMicTools } from "@/components/campaigns/camera-with-mic-tools";

export const dynamic = "force-dynamic";

/**
 * The camera recorder with the shared microphone tools switched on.
 *
 * The same component the live Camera tab renders, with micTools set — so this
 * page tries the picker, meter and pre-flight check on real devices while the
 * Camera tab carries on exactly as before. Behind the same switch as the Spark
 * Calendar; everyone else gets the ordinary 404.
 */
export default async function HiddenCameraPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await hasFeature(user.id, CAMPAIGN_CALENDAR))) notFound();

  return <CameraWithMicTools />;
}
