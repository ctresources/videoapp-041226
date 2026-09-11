/**
 * GET /api/campaigns/blog?campaignId=… — the campaign's article, for Copy as HTML.
 *
 * The words live on the source project's ai_script, where /api/ai/blog writes
 * them; the campaign only points at that project. Fetched on demand rather
 * than with the calendar, which would otherwise carry every article's
 * thousand-odd words just to draw its grid.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCampaignUser } from "@/lib/utils/campaign-access";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const access = await requireCampaignUser();
  if ("response" in access) return access.response;
  const { userId } = access;

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("blog_project_id")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const projectId = (campaign as { blog_project_id: string | null }).blog_project_id;
  if (!projectId) {
    return NextResponse.json({ error: "This campaign has no article linked to it yet." }, { status: 404 });
  }

  const { data: project } = await admin
    .from("projects")
    .select("intro:ai_script->>blog_intro, body:ai_script->>blog_body, conclusion:ai_script->>blog_conclusion")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  const row = project as { intro: string | null; body: string | null; conclusion: string | null } | null;

  if (!row?.body?.trim()) {
    return NextResponse.json(
      { error: "The article hasn't been written yet. Open the video in the editor to write it first.", projectId },
      { status: 404 },
    );
  }

  return NextResponse.json({
    blog: { intro: row.intro ?? "", body: row.body, conclusion: row.conclusion ?? "" },
  });
}
