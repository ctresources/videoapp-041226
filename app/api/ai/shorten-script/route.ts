import { createClient } from "@/lib/supabase/server";
import { freeTrialGateResponse } from "@/lib/utils/free-trial";
import { chatText } from "@/lib/api/perplexity-chat";
import { clampScript, LONG_MAX_WORDS, minutesFor } from "@/lib/utils/video-length";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";
import { NextRequest, NextResponse } from "next/server";

// One rewrite of a long script. Well inside the model's own time, but a
// 2,000-word script is a large prompt and a large answer.
export const maxDuration = 60;

/**
 * POST /api/ai/shorten-script
 *
 * Cuts a pasted script down to what the renderer will actually speak.
 *
 * Offered only where the alternative is worse: a script past the long-video
 * maximum is trimmed at render time by clampScript, which stops at a sentence
 * boundary and simply drops the rest. That is a silent ending mid-argument.
 * Shortening deliberately at least decides *what* goes.
 *
 * Body: { script: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same gate as saving a pasted script — this is a model call on the same tab.
  const gate = await freeTrialGateResponse(user.id);
  if (gate) return gate;

  const { script } = (await req.json()) as { script?: string };
  const text = (script ?? "").trim();
  if (!text) return NextResponse.json({ error: "script is required" }, { status: 400 });

  const words = text.split(/\s+/).length;
  if (words <= LONG_MAX_WORDS) {
    // Nothing to do, and rewriting anyway would quietly reword a script that
    // already fits.
    return NextResponse.json({ script: text, words, unchanged: true });
  }

  /**
   * A target under the cap, and the cap stated outright.
   *
   * A prompt that names only a target overshoots by roughly a third — the same
   * lesson the generation prompts learned. The margin between 1,100 and 1,160
   * is what absorbs the overshoot that still happens.
   */
  const target = 1_100;

  const system = [
    "You shorten real estate video scripts that are too long to be spoken in full.",
    `Cut the script to about ${target} words. Never exceed ${LONG_MAX_WORDS} words.`,
    "Cut whole sentences and repetitions. Do not paraphrase what survives:",
    "the wording that remains must be the author's own, because the avatar",
    "speaks this script exactly as written and the author chose those words.",
    "Keep the opening and the closing. Keep the order of ideas.",
    "Keep every fact, name, place, number and any licence or contact detail.",
    "Return the shortened script as plain prose and nothing else — no preamble,",
    "no notes about what you removed, no headings, no markdown.",
    PLAIN_COPY_RULES,
  ].join(" ");

  const raw = await chatText(
    system,
    [{ role: "user", content: text }],
    { maxTokens: 2200, temperature: 0.2, label: "shorten-script" },
  );

  if (!raw?.trim()) {
    // chatText returns null rather than throwing on a missing key or a
    // transport failure. The caller keeps the original script either way.
    return NextResponse.json(
      { error: "Couldn't shorten the script just now. Your script is unchanged — try again in a moment." },
      { status: 502 },
    );
  }

  /**
   * The cap, enforced rather than requested.
   *
   * A model told not to exceed a number still does often enough to matter, and
   * an over-length answer here would be trimmed at render time anyway — the
   * exact silent cut this route exists to avoid. Clamping here means the word
   * count the user sees is the one that gets spoken.
   */
  const shortened = clampScript(plainCopy(raw.trim()), LONG_MAX_WORDS);
  const finalWords = shortened.split(/\s+/).length;

  return NextResponse.json({
    script: shortened,
    words: finalWords,
    minutes: minutesFor(finalWords),
    removed: words - finalWords,
  });
}
