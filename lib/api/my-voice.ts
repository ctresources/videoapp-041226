import type { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";

/**
 * My voice (2026-11-18, the owner's approved mockup): a short "how I talk"
 * note on the profile that every script writer follows, so a draft sounds like
 * the agent and they stop rewriting it somewhere else. Learned from their own
 * words: scripts they paste, what they say on camera, the changes they ask for,
 * and which of two versions they pick. They can read it, edit it, and switch
 * the learning off in Settings.
 */

type Admin = ReturnType<typeof createAdminClient>;
export type VoiceSource = "pasted" | "recordings" | "edits" | "picks";

export interface MyVoice {
  note: string | null;
  learning: boolean;
  sources: Partial<Record<VoiceSource, number>>;
}

export async function getMyVoice(admin: Admin, userId: string): Promise<MyVoice> {
  const { data } = await admin.from("profiles")
    .select("my_voice, my_voice_learning, my_voice_sources").eq("id", userId).maybeSingle();
  const p = data as { my_voice: string | null; my_voice_learning: boolean | null; my_voice_sources: Record<string, number> | null } | null;
  return {
    note: p?.my_voice?.trim() || null,
    learning: p?.my_voice_learning !== false,
    sources: (p?.my_voice_sources ?? {}) as MyVoice["sources"],
  };
}

/** The line a writer is handed, or "" when there is no note yet. */
export function myVoiceRule(note: string | null | undefined): string {
  const n = (note ?? "").trim();
  if (!n) return "";
  return `MY VOICE: write the way this agent actually talks. ${n} Follow it for word choice, sentence length, how it opens and how it signs off. Use any pet phrase at most once, and never let it change a fact.`;
}

/** The note for a user, as a writer's rule ("" without one). */
export async function myVoiceRuleFor(admin: Admin, userId: string): Promise<string> {
  return myVoiceRule((await getMyVoice(admin, userId)).note);
}

const LEARN_SYSTEM = `You keep a short note describing how one real estate agent talks on video, so scripts written for them sound like them.
You are given the current note (maybe empty) and one new sample of the agent's own words or choices. Update the note with what the sample shows about their voice: tone, energy, sentence length, words and phrases they really use, how they open, how they sign off. Keep what still holds; change what the sample contradicts.
Rules: at most 60 words. Plain sentences. Describe the voice only: never include addresses, prices, statistics, client names or any listing facts. No emojis.
Return ONLY JSON: {"note": "..."}`;

/**
 * Updates the note from one sample. Meant to run after the reply has gone
 * (waitUntil); never throws, and does nothing when learning is off or the
 * sample is too thin to say anything about a voice.
 */
export async function learnMyVoice(
  admin: Admin,
  userId: string,
  source: VoiceSource,
  sample: { text?: string; rejected?: string; instruction?: string },
): Promise<void> {
  try {
    const text = (sample.text ?? "").trim();
    const instruction = (sample.instruction ?? "").trim();
    // An edit is either a change asked for in words, or a script changed by
    // hand (the new words, with the version before as `rejected`).
    const handEdit = source === "edits" && !instruction && !!text && !!sample.rejected;
    if (source === "edits" && !handEdit ? instruction.length < 8 : text.split(/\s+/).length < 30) return;
    const voice = await getMyVoice(admin, userId);
    if (!voice.learning) return;

    const what = source === "picks"
      ? `They were shown two versions and PICKED this one:\n"""${text.slice(0, 3000)}"""\nThey passed on this one:\n"""${(sample.rejected ?? "").slice(0, 3000)}"""`
      : handEdit
        ? `They edited a script written for them, by hand. What it said before:\n"""${(sample.rejected ?? "").slice(0, 3000)}"""\nWhat they changed it to:\n"""${text.slice(0, 3000)}"""\nLearn from what they changed, not from the parts they left alone.`
      : source === "edits"
        ? `They asked for this change to a script written for them: "${instruction.slice(0, 500)}"`
        : source === "recordings"
          ? `What they actually said on camera, in their own words:\n"""${text.slice(0, 3000)}"""`
          : `A script they wrote or brought in themselves:\n"""${text.slice(0, 3000)}"""`;

    const out = await openaiChatJson(LEARN_SYSTEM, [
      { role: "user", content: `Current note: ${voice.note ? `"${voice.note}"` : "(none yet)"}\n\n${what}` },
    ], { maxTokens: 600, label: "my-voice", timeoutMs: 30_000 });
    const note = typeof out?.note === "string" ? out.note.trim().replace(/\s+/g, " ").slice(0, 600) : "";
    if (!note) return;

    const sources = { ...voice.sources, [source]: (voice.sources[source] ?? 0) + 1 };
    await admin.from("profiles").update({ my_voice: note, my_voice_sources: sources }).eq("id", userId);
  } catch (e) {
    console.error("[my-voice] learn failed:", e instanceof Error ? e.message : e);
  }
}
