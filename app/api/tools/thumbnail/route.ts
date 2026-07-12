import { createClient } from "@/lib/supabase/server";
import { renderAndSaveThumbnail } from "@/lib/utils/thumbnail-render";
import { NextRequest, NextResponse } from "next/server";

// AI background generation can take up to a minute on its own.
export const maxDuration = 120;

/**
 * POST /api/tools/thumbnail — { headline?, topic?, projectId?, photoUrl? }
 * Renders an HD 1280×720 YouTube thumbnail (AI 3–4 word curiosity headline,
 * AI bright-sky background, chosen photo composited). When projectId is
 * given the result is saved to the project so Publish shows it.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { headline, topic, projectId, photoUrl, backgroundUrl } = (await req.json()) as {
    headline?: string; topic?: string; projectId?: string; photoUrl?: string; backgroundUrl?: string;
  };

  try {
    const result = await renderAndSaveThumbnail({
      userId: user.id,
      projectId: projectId || undefined,
      headline: headline || undefined,
      topic: topic || undefined,
      photoUrl: photoUrl || undefined,
      backgroundUrl: backgroundUrl || undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[thumbnail] Error:", err);
    const msg = err instanceof Error ? err.message : "Thumbnail generation failed";
    const status = /Select a project|not found/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
