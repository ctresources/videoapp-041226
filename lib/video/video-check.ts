import { createAdminClient } from "@/lib/supabase/admin";
import { countGemini, geminiDeleteFile, geminiJson, geminiKey, geminiUpload } from "@/lib/api/gemini";

/**
 * The video check (2026-11-15, the owner's approved plan, #2): Gemini watches
 * a finished AI video before it shows as ready.
 *
 * "finishing" problems are in what SparkReels adds after the render
 * (captions, b-roll, photos, music): finishing is redone once, free.
 * "render" problems are in the render itself (frozen face, cut-off speech):
 * the agent gets a free Remake.
 *
 * Mode: "enforce" for admin accounts, and for everyone once the owner turns
 * on app_settings.video_checks_everyone; otherwise "record", which only
 * checks after the video is ready and logs what it would have done.
 */

export type CheckMode = "enforce" | "record";
export interface Problem { at: string; what: string; kind: "finishing" | "render" }
export interface CheckResult { status: "ok" | "problems" | "error"; problems: Problem[]; seconds: number }

export const EVERYONE_KEY = "video_checks_everyone";
const MAX_BYTES = 300 * 1024 * 1024;

export async function checkMode(userId: string): Promise<CheckMode | null> {
  if (!geminiKey()) return null;
  const admin = createAdminClient();
  const [{ data: prof }, { data: setting }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("app_settings").select("value").eq("key", EVERYONE_KEY).maybeSingle(),
  ]);
  if ((prof as { role: string | null } | null)?.role === "admin") return "enforce";
  if ((setting as { value: { on?: boolean } | null } | null)?.value?.on) return "enforce";
  return "record";
}

export async function scriptFor(videoId: string): Promise<string> {
  const admin = createAdminClient();
  const { data: v } = await admin.from("generated_videos").select("project_id").eq("id", videoId).maybeSingle();
  const pid = (v as { project_id: string | null } | null)?.project_id;
  if (!pid) return "";
  const { data: p } = await admin.from("projects").select("ai_script").eq("id", pid).maybeSingle();
  const s = ((p as { ai_script: Record<string, unknown> | null } | null)?.ai_script) ?? {};
  return [s.hook, s.script, s.cta].filter((x): x is string => typeof x === "string" && !!x.trim()).join(" ");
}

export async function checkVideo(buf: Buffer, script: string, opts: { captions: boolean; background: boolean }): Promise<CheckResult> {
  const started = Date.now();
  const done = (status: CheckResult["status"], problems: Problem[] = []): CheckResult =>
    ({ status, problems, seconds: Math.round((Date.now() - started) / 1000) });
  if (buf.length > MAX_BYTES) return done("error");
  const up = await geminiUpload(buf, "video/mp4", "video-check", 60_000);
  if (!up) return done("error");
  try {
    const out = await geminiJson<{ problems?: { at?: string; what?: string; kind?: string; major?: boolean }[] }>({
      parts: [
        up.part,
        {
          text: `This is a finished real estate marketing video: an AI presenter speaking${opts.background ? ", with photos or video clips behind or around them" : ""}${opts.captions ? ", with burned-in captions" : ""}${script ? `.\nThe script it should say:\n"${script.slice(0, 3000)}"` : "."}

Watch it all and list only real, clearly visible or audible problems a viewer would notice:
- "render" problems, in the presenter video itself: the presenter's face or body freezes, glitches or warps; speech cuts off mid-word or the ending is cut; audio drops out; lips badly out of sync; black or blank frames over the presenter.
- "finishing" problems, in what was added on top: captions that don't match what is said or skip words, captions overlapping or cut off; a background clip or photo that clearly doesn't fit the words (wrong place, wrong season, a beach in a town with none); a black or frozen background stretch; music drowning out the voice.

Do not list style opinions or tiny issues. If it looks fine, return no problems.

Return ONLY JSON: {"problems":[{"at":"m:ss","what":"under 8 words","kind":"render" or "finishing","major":true}]}`,
        },
      ],
      temperature: 0.1,
      timeoutMs: 75_000,
      label: "video-check",
    });
    if (!out) return done("error");
    void countGemini("video_checks");
    const problems = (out.problems ?? [])
      .filter((p) => p && p.major !== false && typeof p.what === "string" && p.what.trim())
      .slice(0, 5)
      .map((p) => ({
        at: /^\d{1,2}:\d{2}$/.test(String(p.at ?? "").trim()) ? String(p.at).trim() : "",
        what: String(p.what).trim().slice(0, 80),
        kind: p.kind === "render" ? "render" as const : "finishing" as const,
      }));
    return done(problems.length ? "problems" : "ok", problems);
  } finally {
    void geminiDeleteFile(up.name);
  }
}

export async function recordCheck(row: {
  videoId: string; userId: string; mode: CheckMode; result: CheckResult;
  action: "refinished" | "remake_offered" | "would_refinish" | "would_offer_remake" | null;
}): Promise<void> {
  await createAdminClient().from("video_checks").insert({
    video_id: row.videoId, user_id: row.userId, mode: row.mode, status: row.result.status,
    problems: row.result.problems, action: row.action, seconds: row.result.seconds,
  }).then(({ error }) => { if (error) console.error("[video-check] record:", error.message); });
}

/** The first render problem, as shown on the video with Remake · free. */
export function remakeProblem(result: CheckResult): Problem | null {
  return result.problems.find((p) => p.kind === "render") ?? null;
}
