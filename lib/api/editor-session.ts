import { chatJson, chatText, type ChatTurn } from "@/lib/api/perplexity-chat";
import { saidGoAhead } from "@/lib/api/brief-session";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { FAIR_HOUSING_GUARDRAIL } from "@/lib/utils/fair-housing";

/**
 * The editor's four choices — the same ones the Video setup rail holds. The
 * voice session fills these, it does not keep a second copy of them.
 */
export interface EditorSettings {
  videoType: "youtube_16x9" | "reel_9x16" | "youtube_long" | null;
  renderMode: "avatar_voice" | "voice_only" | null;
  musicId: string | null;
  captions: boolean | null;
}

export const EMPTY_SETTINGS: EditorSettings = {
  videoType: null, renderMode: null, musicId: null, captions: null,
};

export interface EditorTurnResult {
  settings: EditorSettings;
  /** The rewritten script, when the agent asked for a change to it. */
  script: string | null;
  /** What was asked of the script, echoed so the UI can say what it did. */
  scriptEdit: string | null;
  /**
   * Whether the rewrite searched the web. Surfaced because the honest answer
   * to "did you use current numbers?" is different in each case.
   */
  searched: boolean;
  reply: string;
  ready: boolean;
}

const VIDEO_TYPES = ["youtube_16x9", "reel_9x16", "youtube_long"] as const;
const RENDER_MODES = ["avatar_voice", "voice_only"] as const;

/** Coerces model output onto values the rail can actually represent. */
export function coerceSettings(raw: unknown): EditorSettings {
  const o = (raw ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => {
    if (typeof v !== "string") return null;
    const t = v.trim().toLowerCase();
    return allowed.find((a) => a.toLowerCase() === t) ?? null;
  };
  const musicRaw = typeof o.musicId === "string" ? o.musicId.trim().toLowerCase() : "";
  // "custom" means upload-your-own — the agent cannot pick that by talking.
  const musicId = MUSIC_PRESETS.find(
    (m) => m.id !== "custom" && m.id.toLowerCase() === musicRaw,
  )?.id ?? null;

  return {
    videoType: pick(o.videoType, VIDEO_TYPES),
    renderMode: pick(o.renderMode, RENDER_MODES),
    musicId,
    captions: typeof o.captions === "boolean" ? o.captions : null,
  };
}

/**
 * One turn of the editor's spoken session.
 *
 * Two stages, deliberately. The first is cheap — it classifies the utterance
 * into setting changes and, if asked, a script instruction, without the script
 * in the prompt at all. The second only runs when the script is actually being
 * changed, because sending a 500-word script up and back on every "make it a
 * reel" would pay for a rewrite that never happens.
 */
export async function runEditorTurn(
  turns: ChatTurn[],
  script: string,
): Promise<EditorTurnResult | null> {
  const musicList = MUSIC_PRESETS.filter((m) => m.id !== "custom")
    .map((m) => `${m.id} (${m.label})`)
    .join(", ");

  const system = `You are adjusting a finished real estate video before it renders. The agent talks; you set the controls.

Return ONLY this JSON, no code fence:
{"videoType":null,"renderMode":null,"musicId":null,"captions":null,"scriptEdit":null,"needsFacts":false,"reply":""}

Fields — return the CURRENT value of each, re-reading the whole conversation, and null for anything never mentioned:
- videoType: "reel_9x16" (shorts, vertical, 9:16, reel, TikTok), "youtube_16x9" (shorts, horizontal, 16:9, YouTube), "youtube_long" (longform, over 4 minutes, horizontal only)
- renderMode: "avatar_voice" (avatar on screen, on camera, show me) or "voice_only" (voice only, no avatar, just narration)
- musicId: one of ${musicList}, or "none" for no music
- captions: true or false (subtitles, captions, burned-in text)
- scriptEdit: if they asked to CHANGE THE WORDS of the script, the instruction in their own words ("make the opening punchier", "cut the part about taxes"). Null if they only changed settings.
- needsFacts: true ONLY if carrying out that instruction requires information the script does not already contain — a current price, a rate, a statistic, a recent event. "Make the opening punchier" and "cut the part about taxes" are false: those rearrange words that are already there. "Add the current median price" and "update that stat" are true.

Rules:
- Never invent a value. Only use the listed ids. If what they said isn't one of them, leave it null rather than forcing the nearest.
- A later instruction replaces an earlier one.
- "reply" is one or two spoken sentences saying what you changed, then inviting "Spark video" to render. No lists, no markdown, no field names.
- Do not decide whether they consented to render — just invite it.`;

  const parsed = await chatJson(system, turns, { maxTokens: 400, label: "editor-session" });
  if (!parsed) return null;

  const settings = coerceSettings(parsed);
  const scriptEdit =
    typeof parsed.scriptEdit === "string" && parsed.scriptEdit.trim()
      ? parsed.scriptEdit.trim().slice(0, 400)
      : null;
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim().slice(0, 400)
      : "Got it. Say Spark video to render.";

  // Search costs a slower turn and a research-grade model, so it is spent
  // only where the answer depends on the world rather than on the words
  // already in front of us.
  const needsFacts = parsed.needsFacts === true;
  let rewritten: string | null = null;
  let searched = false;
  if (scriptEdit && script.trim()) {
    searched = needsFacts;
    rewritten = await rewriteScript(script, scriptEdit, needsFacts);
  }

  const lastUser = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  return {
    settings,
    script: rewritten,
    scriptEdit,
    searched: searched && !!rewritten,
    reply,
    // Same rule as the brief: consent is decided here, not by the model.
    ready: saidGoAhead(lastUser),
  };
}

/**
 * Applies one spoken instruction to a script.
 *
 * Returns null rather than a partial rewrite on any failure — the caller keeps
 * the script it already had, which is always safe. Silently replacing a good
 * script with a truncated one is the failure worth avoiding here.
 */
export async function rewriteScript(
  script: string,
  instruction: string,
  withSearch = false,
): Promise<string | null> {
  const system = `You are editing the narration script of a real estate video. The agent has asked for one change.

Return ONLY the full revised script as plain spoken prose. No preamble, no explanation, no markdown, no quotes around it, no headings.

Rules:
- Apply exactly what was asked and change nothing else. Leave every other sentence as it is.
- Keep roughly the same length unless the instruction was explicitly about length.
- It is read aloud by an avatar: complete conversational sentences, no bullet points, no emoji, no citation markers.
${withSearch
      ? "- Search for the figure being asked for and use the real, current number you find. Name the period it refers to if the source gives one. If you cannot verify it, describe the pattern in words rather than inventing a value."
      : "- Never invent statistics. If the change would need a figure you do not have, write around it."
    }

${FAIR_HOUSING_GUARDRAIL}`;

  const out = await chatText(
    system,
    [{ role: "user", content: `Instruction: ${instruction}\n\nScript:\n"""\n${script}\n"""` }],
    { maxTokens: 2000, temperature: 0.4, label: "rewrite-script", search: withSearch },
  );
  if (!out) return null;

  const cleaned = out.replace(/^["'\s]+|["'\s]+$/g, "");
  // A rewrite that comes back a fraction of the original is a truncation or a
  // refusal, not an edit. Keeping the original beats shipping a stub.
  if (cleaned.split(/\s+/).length < script.split(/\s+/).length * 0.5) return null;
  return cleaned;
}
