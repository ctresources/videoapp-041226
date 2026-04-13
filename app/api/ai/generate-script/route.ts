import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVideoScript, generateSeoData } from "@/lib/api/perplexity";
import { searchRealEstateContext } from "@/lib/api/yousearch";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recordingId, projectType = "blog_video" } = await req.json();
  if (!recordingId) return NextResponse.json({ error: "recordingId required" }, { status: 400 });

  const admin = createAdminClient();

  // Get recording + profile
  const [recordingResult, profileResult] = await Promise.all([
    admin.from("voice_recordings").select("transcript, title").eq("id", recordingId).eq("user_id", user.id).single(),
    admin.from("profiles").select("full_name, credits_remaining").eq("id", user.id).single(),
  ]);

  const recording = recordingResult.data as { transcript: string | null; title: string | null } | null;
  const profile = profileResult.data as { full_name: string | null; credits_remaining: number } | null;

  if (!recording?.transcript) {
    return NextResponse.json({ error: "No transcript found. Please transcribe the recording first." }, { status: 400 });
  }
  if (!profile || profile.credits_remaining < 1) {
    return NextResponse.json({ error: "Insufficient credits." }, { status: 402 });
  }

  // Optionally enrich with real-time market data
  let marketContext = "";
  try {
    const searchQuery = `real estate ${recording.transcript.split(" ").slice(0, 10).join(" ")}`;
    const searchResult = await searchRealEstateContext(searchQuery);
    if (searchResult.summary) {
      marketContext = `\n\nCurrent market context: ${searchResult.summary}`;
    }
  } catch {
    // Non-fatal, continue without enrichment
  }

  const enrichedTranscript = recording.transcript + marketContext;
  const agentName = profile.full_name || "the agent";

  try {
    // Generate script and SEO in parallel
    const aiScript = await generateVideoScript(enrichedTranscript, agentName, projectType);
    const seoData = await generateSeoData(aiScript.title, aiScript.script, aiScript.keywords);

    // Create project
    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({
        user_id: user.id,
        voice_recording_id: recordingId,
        title: aiScript.title,
        project_type: projectType,
        status: "draft",
        ai_script: aiScript as unknown as Record<string, unknown>,
        seo_data: seoData as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    if (projectError) throw new Error(projectError.message);

    // Deduct credit + log usage
    await Promise.all([
      admin.from("profiles").update({ credits_remaining: profile.credits_remaining - 1 }).eq("id", user.id),
      admin.from("api_usage_log").insert({ user_id: user.id, api_provider: "perplexity", endpoint: "generate-script", credits_used: 1, response_status: 200 }),
    ]);

    return NextResponse.json({ project, aiScript, seoData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    console.error("generate-script error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
