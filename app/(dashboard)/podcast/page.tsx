import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/utils/feature-access";
import { PODCAST_FEATURE } from "@/lib/podcast/podcast";
import { PodcastStudio } from "@/components/podcast/podcast-studio";

export const dynamic = "force-dynamic";

/** Spark Podcast (2026-10-30): only for accounts with the switch on, for now. */
export default async function PodcastPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasFeature(user.id, PODCAST_FEATURE))) redirect("/create");
  return <PodcastStudio />;
}
