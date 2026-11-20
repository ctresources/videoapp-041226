import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson } from "@/lib/api/perplexity-chat";
import { learnMyVoice, myVoiceRuleFor } from "@/lib/api/my-voice";
import { PLAIN_COPY_RULES, plainCopy } from "@/lib/utils/copy-style";
import { FAIR_HOUSING_SHORT } from "@/lib/utils/fair-housing";
import { scriptWithoutRepeats } from "@/lib/utils/script-assembly";
import { clampScript } from "@/lib/utils/video-length";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST /api/ai/topic-chat (2026-11-18, the owner's approved mockup).
 *
 * The topic box as a chat. The first draft is written as before (research
 * and all, by generate-location-script, which saves the project); this route
 * then works on that project:
 *   second  - a second version from the same facts, in the agent's voice
 *   pick    - the version they chose becomes the project's script
 *   refine  - "make it shorter", "add my Ambler story": rewritten, facts kept
 *   again   - two fresh versions from the same facts
 * Picks and change requests teach My voice. Nothing here costs a video.
 */

interface Version { title: string; hook: string; script: string }

const WRITER = (voice: string, words: number) => `You write short spoken video scripts for a real estate agent, in first person, to camera.
${voice}
Keep every fact, number and place from the material you are given. Never invent a statistic, price, client or promise. If you are asked to add a story, use only what the agent tells you about it.
About ${words} words of script (never more than ${Math.round(words * 1.15)}). The script does not repeat the hook, and has no call to action at the end: that is added separately. No stage directions, labels, headings or markdown. Plain spoken English.
${FAIR_HOUSING_SHORT}
${PLAIN_COPY_RULES}`;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function asVersion(o: unknown, fallback: Version, cap: number): Version | null {
  const r = (o ?? {}) as Record<string, unknown>;
  const script = typeof r.script === "string" ? r.script : "";
  if (words(script) < 20) return null;
  const hook = plainCopy(typeof r.hook === "string" && r.hook.trim() ? r.hook.trim() : fallback.hook);
  return {
    title: plainCopy(typeof r.title === "string" && r.title.trim() ? r.title.trim().slice(0, 100) : fallback.title),
    hook,
    script: clampScript(scriptWithoutRepeats(plainCopy(script), hook), cap),
  };
}

/** OpenAI first; Perplexity's chat model if it is down, so the chat never dead-ends. */
async function write(system: string, prompt: string, label: string): Promise<Record<string, unknown> | null> {
  return (await openaiChatJson(system, [{ role: "user", content: prompt }], { maxTokens: 3000, label, timeoutMs: 45_000 }))
    ?? (await chatJson(system, [{ role: "user", content: prompt }], { maxTokens: 3000, label }).catch(() => null));
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; projectId?: string; which?: number; message?: string };
  const admin = createAdminClient();

  const { data: row } = await admin.from("projects").select("id, title, ai_script").eq("id", b.projectId ?? "").eq("user_id", user.id).maybeSingle();
  const project = row as { id: string; title: string | null; ai_script: Record<string, unknown> | null } | null;
  if (!project?.ai_script) return NextResponse.json({ error: "That draft isn't there any more. Start again." }, { status: 404 });
  const ai = project.ai_script;

  // The research draft, kept as the facts every later version is written from.
  const original: Version = (ai.chat_original as Version | undefined) ?? {
    title: String(ai.title ?? project.title ?? ""), hook: String(ai.hook ?? ""), script: String(ai.script ?? ""),
  };
  const current: Version = { title: String(ai.title ?? ""), hook: String(ai.hook ?? ""), script: String(ai.script ?? "") };
  const target = Math.max(60, words(original.script));
  const cap = Math.round(target * 1.15);
  const voice = await myVoiceRuleFor(admin, user.id);
  const facts = `Title: ${original.title}\nHook: ${original.hook}\nScript:\n${original.script}`;

  const save = async (patch: Record<string, unknown>) => {
    await admin.from("projects").update({ ai_script: { ...ai, chat_original: original, ...patch } }).eq("id", project.id);
  };

  if (b.action === "second") {
    const out = await write(
      WRITER(voice, target),
      `Here is a first draft with the facts researched:\n${facts}\n\nWrite a second, clearly different version: a different opening and angle, the same facts. Return ONLY JSON {"title": "...", "hook": "one opening line", "script": "..."}`,
      "topic-chat-second",
    );
    const v2 = asVersion(out, original, cap);
    if (!v2) return NextResponse.json({ error: "Couldn't write a second version. You can still use this one." }, { status: 502 });
    await save({ chat_versions: [original, v2] });
    return NextResponse.json({ versions: [original, v2] });
  }

  if (b.action === "again") {
    const out = await write(
      WRITER(voice, target),
      `Here is a researched draft:\n${facts}\n\nWrite two new versions, clearly different from it and from each other, with the same facts. Return ONLY JSON {"versions": [{"title": "...", "hook": "...", "script": "..."}, {"title": "...", "hook": "...", "script": "..."}]}`,
      "topic-chat-again",
    );
    const list = Array.isArray(out?.versions) ? (out!.versions as unknown[]) : [];
    const vs = list.map((v) => asVersion(v, original, cap)).filter((v): v is Version => !!v).slice(0, 2);
    if (vs.length < 2) return NextResponse.json({ error: "Couldn't write two new versions. Try again." }, { status: 502 });
    await save({ chat_versions: vs });
    return NextResponse.json({ versions: vs });
  }

  if (b.action === "pick") {
    const versions = (ai.chat_versions as Version[] | undefined) ?? [];
    const which = b.which === 1 ? 1 : 0;
    const chosen = versions[which];
    if (!chosen) return NextResponse.json({ error: "Pick one of the two versions." }, { status: 400 });
    await save({ title: chosen.title, hook: chosen.hook, script: chosen.script, chat_changed: chosen.script !== original.script });
    const other = versions[which === 1 ? 0 : 1];
    waitUntil(learnMyVoice(admin, user.id, "picks", { text: chosen.script, rejected: other?.script }));
    return NextResponse.json({ version: chosen });
  }

  if (b.action === "refine") {
    const message = (b.message ?? "").trim().slice(0, 800);
    if (!message) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
    const out = await write(
      WRITER(voice, target),
      `The facts, as researched:\n${facts}\n\nThe current version:\nTitle: ${current.title}\nHook: ${current.hook}\nScript:\n${current.script}\n\nThe agent asks: "${message}"\nRewrite the current version to do that. Return ONLY JSON {"title": "...", "hook": "...", "script": "..."}`,
      "topic-chat-refine",
    );
    const v = asVersion(out, current, cap);
    if (!v) return NextResponse.json({ error: "Couldn't make that change. Try saying it another way." }, { status: 502 });
    await save({ title: v.title, hook: v.hook, script: v.script, chat_changed: true });
    waitUntil(learnMyVoice(admin, user.id, "edits", { instruction: message }));
    return NextResponse.json({ version: v });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
