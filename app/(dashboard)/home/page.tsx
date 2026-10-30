import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "@/components/home/home-dashboard";
import { GettingStarted } from "@/components/insights/start-parts";

export const dynamic = "force-dynamic";

/**
 * Home (2026-10-29, the owner's agentic dashboard). The landing page after
 * login: Ask Sparklee first, then what needs the agent, what's running, the
 * week and their numbers. The setup checklist moved here from Spark Insights.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <HomeDashboard
      checklist={user ? <div className="mt-3"><Suspense fallback={null}><GettingStarted userId={user.id} /></Suspense></div> : null}
    />
  );
}
