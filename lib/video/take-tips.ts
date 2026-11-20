import { createAdminClient } from "@/lib/supabase/admin";
import { countGemini, geminiDeleteFile, geminiJson, geminiKey, geminiUpload } from "@/lib/api/gemini";
import { learnMyVoice } from "@/lib/api/my-voice";

/**
 * Camera take tips (2026-11-15, the owner's approved plan, #4): after a take
 * is saved, Gemini watches it and writes one thing that went well and up to
 * three short tips with the time in the video. Saved on the video as
 * metadata.take_tips; the saved screen and My Content read it from there.
 * Never in the way of the save: this runs after the reply has gone.
 */

export interface TakeTips {
  good?: string;
  tips?: { at: string; tip: string }[];
  failed?: boolean;
  at: string;
}

const MAX_BYTES = 200 * 1024 * 1024; // about 10 minutes of browser recording

export async function makeTakeTips(videoId: string, videoUrl: string, script: string): Promise<void> {
  if (!geminiKey()) return;
  const admin = createAdminClient();
  const save = async (tips: TakeTips) => {
    const { data } = await admin.from("generated_videos").select("metadata").eq("id", videoId).single();
    const meta = ((data as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? {};
    await admin.from("generated_videos").update({ metadata: { ...meta, take_tips: tips } }).eq("id", videoId);
  };

  let fileName = "";
  try {
    const head = await fetch(videoUrl, { method: "HEAD" });
    const size = Number(head.headers.get("content-length") || 0);
    if (size > MAX_BYTES) return; // too long to coach; nothing is shown
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`download ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = /\.webm(\?|$)/i.test(videoUrl) ? "video/webm" : "video/mp4";
    const up = await geminiUpload(buf, mime, `take-${videoId}`, 180_000);
    if (!up) throw new Error("upload");
    fileName = up.name;

    const out = await geminiJson<{ good?: string; tips?: { at?: string; tip?: string }[]; said?: string }>({
      parts: [
        up.part,
        {
          text: `This is a real estate agent recording themselves on camera for a short social video${script ? `, reading this script:\n"${script.slice(0, 2500)}"` : "."}

Coach them like a friendly video coach. Look at eye contact with the lens, pace, energy, filler words, framing and light, and whether the ending is cut off.

Return ONLY JSON:
{"good": "one thing that went well, under 8 words",
 "tips": [{"at": "m:ss", "tip": "one fix, under 10 words"}],
 "said": "up to 150 words of what they actually said, word for word, including any words of their own that are not in the script"}

At most 3 tips, the most useful first, each with the time it happens. Plain words, kind, specific. If the take is strong, return fewer tips. Never comment on how the person looks.`,
        },
      ],
      temperature: 0.3,
      timeoutMs: 120_000,
      label: "take-tips",
    });
    if (!out) throw new Error("no answer");
    void countGemini("take_tips");
    const tips = (out.tips ?? [])
      .filter((t) => typeof t?.tip === "string" && t.tip.trim())
      .slice(0, 3)
      .map((t) => ({ at: /^\d{1,2}:\d{2}$/.test(String(t.at ?? "").trim()) ? String(t.at).trim() : "", tip: String(t.tip).trim().slice(0, 80) }));
    await save({ good: typeof out.good === "string" ? out.good.trim().slice(0, 60) : undefined, tips, at: new Date().toISOString() });
    // My voice (2026-11-18): what they really said on camera.
    if (typeof out.said === "string" && out.said.trim()) {
      const { data: v } = await admin.from("generated_videos").select("user_id").eq("id", videoId).single();
      const userId = (v as { user_id: string } | null)?.user_id;
      if (userId) await learnMyVoice(admin, userId, "recordings", { text: out.said });
    }
  } catch (e) {
    console.error(`[take-tips] ${videoId}:`, e instanceof Error ? e.message : e);
    await save({ failed: true, at: new Date().toISOString() }).catch(() => null);
  } finally {
    if (fileName) void geminiDeleteFile(fileName);
  }
}
