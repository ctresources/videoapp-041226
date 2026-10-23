import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatJson } from "@/lib/api/perplexity-chat";
import { ensureSparkFor } from "@/lib/utils/ensure-spark";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";

export const maxDuration = 60;

/**
 * POST /api/ai/agent-intro — the Agent Intro (2026-10-23, the owner's
 * approved mockup). Writes a first-person intro script plus a short and a
 * long bio from the About-you panel, and saves them as a project that opens
 * in the editor like a pasted script (spoken as written).
 *
 * The render side is in start-render: an intro is a plain talking head, on
 * Avatar V with a Digital Twin, and Producer/Influencer get one a month free.
 */
const HELPS = new Set([
  "Buyers", "Sellers", "First-time buyers", "Move-up buyers", "Downsizing",
  "Luxury", "Investors", "Relocation", "New construction", "VA loans",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A step toward a video, so it never spends the free tries.
  const gate = await freeTrialGateResponse(user.id, { preVideo: "toward-video" });
  if (gate) return gate;

  const b = (await req.json().catch(() => ({}))) as {
    name?: string; brokerage?: string; city?: string; state?: string; years?: string;
    helps?: string[]; different?: string; about?: string; profileUrl?: string;
  };
  const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const name = clean(b.name, 80);
  const brokerage = clean(b.brokerage, 80);
  const city = clean(b.city, 60);
  const state = clean(b.state, 30);
  const years = clean(b.years, 10);
  const helps = (Array.isArray(b.helps) ? b.helps : []).filter((h) => HELPS.has(h)).slice(0, 10);
  const different = clean(b.different, 400);
  const about = clean(b.about, 400);
  const profileUrl = /^https?:\/\/\S+$/i.test(clean(b.profileUrl, 300)) ? clean(b.profileUrl, 300) : "";
  // Always 30 seconds (the owner's call, 2026-10-23).
  const seconds = 30;
  const words = 72;

  if (!name) return NextResponse.json({ error: "Add your name." }, { status: 400 });
  if (!city) return NextResponse.json({ error: "Add the area you serve." }, { status: 400 });
  const market = [city, state].filter(Boolean).join(", ");

  const facts = [
    `Name: ${name}`,
    brokerage && `Brokerage: ${brokerage}`,
    `Area served: ${market}`,
    years && `Years in real estate: ${years}`,
    helps.length > 0 && `Helps most: ${helps.join(", ")}`,
    different && `What makes them different, in their words: ${different}`,
    about && `About them, in their words: ${about}`,
    profileUrl && `Public profile to read for reviews, sales and specialties: ${profileUrl}`,
  ].filter(Boolean).join("\n");

  const system = `You write short, warm, first-person introduction videos for real estate agents, and matching bios. Return only valid JSON.

${PLAIN_COPY_RULES}

FAIR HOUSING: never describe or prefer buyers or neighborhoods by race, color, religion, sex, disability, familial status, national origin or any protected class. No "family-friendly", "safe", "good schools for your kids" or similar. Describe services, experience and the agent, never who lives where.`;

  const prompt = `Write an Agent Intro for this agent.

${facts}

Return JSON:
{
  "title": "Meet ${name}" or a short equivalent,
  "script": the spoken intro, FIRST PERSON, about ${words} words (it runs about ${seconds} seconds), starting with their name and where they work, then how they help and what makes them different, and ending with a short warm invitation to call or text. Natural spoken sentences, no headings, no emojis, no hashtags, no phone numbers or URLs spoken,
  "bioShort": a first-person bio of at most 150 characters for Google Business or Instagram,
  "bioLong": a first-person bio of 120 to 150 words for a website About page
}

Use only facts given here or found on the profile link. Never invent awards, sales numbers, reviews or designations.`;

  const out = await chatJson(system, [{ role: "user", content: prompt }], {
    maxTokens: 900, temperature: 0.5, label: "agent-intro", search: !!profileUrl,
  });
  const script = plainCopy(String(out?.script ?? "")).trim();
  if (!out || !script) {
    return NextResponse.json({ error: "We couldn't write your intro just now. Please try again." }, { status: 502 });
  }
  const title = clean(out.title, 80) || `Meet ${name}`;
  const bioShort = plainCopy(String(out.bioShort ?? "")).trim().slice(0, 200);
  const bioLong = plainCopy(String(out.bioLong ?? "")).trim().slice(0, 1500);
  const firstSentence = script.split(/(?<=[.!?])\s+/)[0] ?? script.slice(0, 120);

  const admin = createAdminClient();
  const aiScript = {
    title,
    hook: firstSentence,
    hooks: [firstSentence],
    script,
    cta: "",
    // The intro ends with its own short invitation; the saved closing line
    // would double it and push it past 30 seconds.
    cta_off: true,
    description: bioShort,
    hashtags: [],
    keywords: [],
    blog_intro: "",
    blog_body: "",
    blog_conclusion: "",
    video_type: "custom",
    location: market,
    custom_topic: title,
    video_length: "standard",
    verbatim: true,
    kind: "agent_intro",
    intro_seconds: seconds,
    agent_bio_short: bioShort,
    agent_bio_long: bioLong,
    audience: null,
    tone: null,
    purpose: "Agent introduction",
  };

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      user_id: user.id,
      title,
      project_type: "location_script",
      status: "draft",
      location_city: city || null,
      location_state: state || null,
      ai_script: aiScript,
      seo_data: {
        meta_title: title,
        meta_description: bioShort || firstSentence,
        youtube_title: title,
        youtube_description: bioLong || firstSentence,
        instagram_caption: bioShort,
        hashtags: [],
        keywords: [],
        thumbnail_url: "",
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      },
    })
    .select("id")
    .single();
  if (error || !project) {
    console.error("[agent-intro] project insert failed:", error?.message);
    return NextResponse.json({ error: "Couldn't save your intro. Please try again." }, { status: 500 });
  }
  await ensureSparkFor(admin, user.id, (project as { id: string }).id);
  return NextResponse.json({ projectId: (project as { id: string }).id });
}
