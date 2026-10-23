import { createClient } from "@/lib/supabase/server";
import { generateAnswerBlocks } from "@/lib/ai/answer-blocks";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * AI Answer Blocks — one research pass, two outputs.
 *
 * The research finds what buyers in an agent's market actually ask AI
 * assistants. Each question then becomes:
 *
 *   1. A VIDEO TOPIC — a question real buyers are asking is, by definition, a
 *      good thing to make a video about. This is the half that lands back in
 *      the agent's normal workflow: the topic deep-links into /create.
 *   2. A TEXT BLOCK for their website — shaped the way assistants extract
 *      answers (question as heading, answer stated outright in the first
 *      sentence, concrete local specifics, a named source), so the agent
 *      becomes the cited source.
 *
 * Video is the half most agents will act on; many can't easily edit their own
 * site (brokerage-hosted templates, IDX pages). Both are produced because the
 * expensive part — finding the questions — is shared.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const { agentName, city, state, niche, brokerage } = await req.json() as {
    agentName: string;
    city: string;
    state?: string;
    niche?: string;
    brokerage?: string;
  };

  if (!agentName?.trim()) return NextResponse.json({ error: "agentName required" }, { status: 400 });
  if (!city?.trim()) return NextResponse.json({ error: "city required" }, { status: 400 });

  try {
    const blocks = await generateAnswerBlocks({ agentName, city, state, niche, brokerage });
    return NextResponse.json({ blocks });
  } catch {
    return NextResponse.json(
      { error: "Could not generate answer blocks. Please try again." },
      { status: 502 },
    );
  }
}
