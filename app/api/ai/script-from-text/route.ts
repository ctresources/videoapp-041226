import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { chatText } from "@/lib/api/perplexity-chat";
import {
  clampScript,
  targetWords,
  maxWords,
  minutesFor,
  type VideoLength,
} from "@/lib/utils/video-length";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";
import { NextRequest, NextResponse } from "next/server";

// Summarising a long blog post is one model call over a large input.
export const maxDuration = 60;

/** Past this the input is a document, not a blog post. */
const MAX_INPUT_CHARS = 20000;

/**
 * POST /api/ai/script-from-text
 *
 * Turns source material — a blog post, an article, notes — into a spoken
 * script of a chosen length.
 *
 * The opposite of the paste tab's usual promise. There, what you type is what
 * the avatar says. Here you hand over something too long to speak and get back
 * something that can be, which you read and edit before anything renders.
 *
 * Deliberately NOT generateVideoScript, which is the market-update writer: its
 * prompt sends the model to search for current prices, days on market and
 * inventory and weave them into the script. That is right when the input is a
 * spoken topic and wrong here — you would approve a script carrying statistics
 * that were never in your blog post, attributed to you. This one summarises
 * what it is given and adds nothing.
 *
 * Body: { text: string, length?: "rendered_short" | "rendered_long" }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const body = (await req.json()) as { text?: string; length?: string };
  const source = (body.text ?? "").trim();

  if (source.length < 200) {
    return NextResponse.json(
      { error: "That's too short to summarise. Paste the blog post, or write the script yourself." },
      { status: 400 },
    );
  }
  if (source.length > MAX_INPUT_CHARS) {
    // Said rather than silently truncated: a summary of the first half of a
    // post, presented as a summary of the post, is the kind of wrong that is
    // only discovered after the video has been made.
    return NextResponse.json(
      {
        error:
          `That's ${source.length.toLocaleString()} characters — longer than this can summarise in one go ` +
          `(${MAX_INPUT_CHARS.toLocaleString()} max). Trim it, or split it into two videos.`,
      },
      { status: 413 },
    );
  }

  const length: VideoLength = body.length === "rendered_long" ? "long" : "standard";
  const target = targetWords(length, null);
  const cap = maxWords(length, null);

  const system = [
    FAIR_HOUSING_GUARDRAIL,
    "",
    "You turn a piece of writing into a script to be spoken aloud in a video.",
    `Aim for about ${target} words — roughly ${minutesFor(target)} minutes spoken. Never exceed ${cap} words.`,
    "Use only what is in the text you are given. Do not research, do not add",
    "statistics, prices, dates or facts that are not already there, and do not",
    "invent examples. If the text does not say it, it does not go in the script.",
    "Keep the author's argument and the order they made it in. Keep their",
    "opinions as theirs. Write in the first person if the source does.",
    "Write for the ear, not the page: short sentences, plain words, no headings,",
    "no bullet points, no lists, nothing that only works when read.",
    "Do not open with a greeting or a hook, and do not close with a call to",
    "action or contact details — both are added separately.",
    "Return the script as plain prose and nothing else: no preamble, no notes",
    "about what you left out, no markdown.",
    PLAIN_COPY_RULES,
  ].join(" ");

  const raw = await chatText(
    system,
    [{ role: "user", content: source }],
    { maxTokens: 2200, temperature: 0.3, label: "script-from-text" },
  );

  if (!raw?.trim()) {
    return NextResponse.json(
      { error: "Couldn't turn that into a script just now. Your text is unchanged — try again in a moment." },
      { status: 502 },
    );
  }

  /**
   * The cap enforced, not merely asked for.
   *
   * Past it the render-time clamp cuts the script anyway, and then what was
   * read and approved is not what gets spoken — which would make the approval
   * step decorative.
   */
  const script = clampScript(plainCopy(raw.trim()), cap);
  const words = script.split(/\s+/).length;

  return NextResponse.json({ script, words, minutes: minutesFor(words) });
}
