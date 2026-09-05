import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVideoScript, generateSeoData, generateYoutubeMetadata } from "@/lib/api/perplexity";
import { searchRealEstateContext } from "@/lib/api/yousearch";
import { targetWords } from "@/lib/utils/video-length";
import { NextRequest, NextResponse } from "next/server";

// sonar-pro web search can take 30-50s; SEO calls add another 15-20s
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { recordingId, projectType = "blog_video", videoLength, unbranded, city, state } = await req.json();
  const isUnbranded = unbranded === true;
  if (!recordingId) return NextResponse.json({ error: "recordingId required" }, { status: 400 });

  const admin = createAdminClient();

  // Get recording + profile
  const [recordingResult, profileResult] = await Promise.all([
    admin.from("voice_recordings").select("transcript, title").eq("id", recordingId).eq("user_id", user.id).single(),
    admin.from("profiles").select("full_name, company_name, phone, company_phone, website, location_city, location_state, subscription_tier").eq("id", user.id).single(),
  ]);

  const recording = recordingResult.data as { transcript: string | null; title: string | null } | null;
  const profile = profileResult.data as {
    full_name: string | null;
    company_name: string | null;
    phone: string | null;
    company_phone: string | null;
    website: string | null;
    location_city: string | null;
    location_state: string | null;
  } | null;

  if (!recording?.transcript) {
    return NextResponse.json({ error: "No transcript found. Please transcribe the recording first." }, { status: 400 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 400 });
  }

  /**
   * The market for THIS video, not the agent's home town.
   *
   * The camera tab asks for a city and state and says the answer feeds the
   * channel CTA and the end card — "set it to the property's town, not your
   * office" — but the recording route never sent them, and this route read
   * the profile instead. A Willow Grove listing went out saying Blue Bell,
   * which is the exact failure that field was added to prevent.
   *
   * The profile is still the fallback, for callers with nothing to say.
   */
  const videoCity = (typeof city === "string" && city.trim()) || profile.location_city || null;
  const videoState = (typeof state === "string" && state.trim()) || profile.location_state || null;

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

  // Script length follows the video the user is making — a long video needs a
  // ~1,100-word script, a standard one ~400-520 depending on plan.
  const tier = (profile as { subscription_tier?: string | null }).subscription_tier ?? null;
  const words = targetWords(videoLength === "long" ? "long" : "standard", tier);

  try {
    // Script generation is required — uses sonar-pro with web search (~30-50s)
    const aiScript = await generateVideoScript(enrichedTranscript, agentName, projectType, words, isUnbranded);

    // The prompt asks for an empty CTA on an unbranded cut; this is what makes
    // it true. The CTA is joined onto the spoken script downstream, so a model
    // that writes one anyway would put "give me a call" into the very video
    // that may not carry it — and nothing later in the flow would catch it.
    if (isUnbranded) aiScript.cta = "";

    const thumbnailUrl = `/api/thumbnail?hook=${encodeURIComponent((aiScript.hook || aiScript.title).slice(0, 180))}&agent=${encodeURIComponent(profile.full_name || "")}`;

    // SEO enrichment is optional — uses sonar (fast, ~5-10s each). If they timeout
    // after the script call consumed most of the 60s budget, proceed without them.
    const [baseSeo, ytMeta] = await Promise.all([
      generateSeoData(aiScript.title, aiScript.script, aiScript.keywords).catch((err) => {
        console.error("[generate-script] SEO generation failed (non-fatal):", err);
        return null;
      }),
      generateYoutubeMetadata({
        title: aiScript.title,
        script: aiScript.script,
        city: videoCity || undefined,
        state: videoState || undefined,
        agentName: profile.full_name || undefined,
        brokerage: profile.company_name || undefined,
        keywords: aiScript.keywords,
        website: profile.website || undefined,
        phone: profile.phone || profile.company_phone || undefined,
      }).catch((err) => {
        console.error("[generate-script] YouTube metadata failed (non-fatal):", err);
        return null;
      }),
    ]);

    const seoData = {
      ...(baseSeo ?? {}),
      youtube_title: ytMeta?.youtube_title || baseSeo?.youtube_title,
      youtube_description: ytMeta?.youtube_description || baseSeo?.youtube_description,
      thumbnail_url: thumbnailUrl,
    };

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
        // Written onto the project, so the editor's CTA and the render's end
        // card read this video's market rather than falling back to the
        // profile's home city later on.
        location_city: videoCity,
        location_state: videoState,
      })
      .select()
      .single();

    if (projectError) throw new Error(projectError.message);

    await admin.from("api_usage_log").insert({ user_id: user.id, api_provider: "perplexity", endpoint: "generate-script", credits_used: 0, response_status: 200 });

    return NextResponse.json({ project, aiScript, seoData });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Script generation failed";
    console.error("generate-script error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
