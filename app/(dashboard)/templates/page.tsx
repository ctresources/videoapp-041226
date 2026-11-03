import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TemplatesStudio } from "@/components/templates/templates-studio";

export const dynamic = "force-dynamic";

/** Quick Reels Templates: open to every account since 2026-11-03. */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <TemplatesStudio />;
}
