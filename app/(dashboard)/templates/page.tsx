import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasFeature } from "@/lib/utils/feature-access";
import { TEMPLATE_FEATURE } from "@/lib/templates/designs";
import { TemplatesStudio } from "@/components/templates/templates-studio";

export const dynamic = "force-dynamic";

/** Video templates (2026-11-02): only for accounts with the switch on while being tested. */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await hasFeature(user.id, TEMPLATE_FEATURE))) redirect("/create");
  return <TemplatesStudio />;
}
