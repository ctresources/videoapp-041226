import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    title?: string;
    script: string;
    city?: string;
    state?: string;
  };

  const { script, city = "", state = "" } = body;
  const title = (body.title?.trim()) || (city && state ? `My Script — ${city}, ${state}` : "My Script");

  if (!script?.trim()) {
    return NextResponse.json({ error: "script is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Use first sentence as hook
  const firstSentence = script.trim().split(/(?<=[.!?])\s+/)[0] ?? script.trim().slice(0, 120);

  const aiScript = {
    title,
    hook: firstSentence,
    hooks: [firstSentence],
    script: script.trim(),
    cta: "",
    description: "",
    hashtags: [],
    keywords: [],
    blog_intro: "",
    blog_body: "",
    blog_conclusion: "",
    video_type: "custom",
    location: city && state ? `${city}, ${state}` : "",
    custom_topic: title,
  };

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      project_type: "location_script",
      status: "draft",
      ai_script: aiScript,
      seo_data: {
        meta_title: title,
        meta_description: firstSentence,
        youtube_title: title,
        youtube_description: firstSentence,
        instagram_caption: "",
        hashtags: [],
        keywords: [],
        thumbnail_url: "",
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      },
    })
    .select()
    .single();

  if (projectError) {
    console.error("paste-script project insert error:", projectError);
    return NextResponse.json({ error: "Failed to save project" }, { status: 500 });
  }

  return NextResponse.json({ project });
}
