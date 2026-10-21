"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, FileText, Loader2, Sparkles, Video } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { FieldMic } from "@/components/ui/field-mic";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";
import { PAID_TIERS } from "@/lib/utils/plan-features";

/**
 * Weekly Autopilot's review screen (2026-10-21, the owner's plan and mockup).
 *
 * This week's drafts, each written as an ordinary project by the Sunday run
 * or by "Ask for ideas". Approve opens it in the editor to make (step 1: the
 * agent still presses Spark It), Change opens it to edit first, Skip sets it
 * aside. Nothing is made, posted or charged from here.
 */

interface Draft {
  id: string;
  week_of: string;
  slot_at: string;
  kind: "video" | "blog";
  topic: string;
  reason: string | null;
  requested: boolean;
  project_id: string | null;
  status: "writing" | "draft" | "approved" | "skipped" | "failed";
  projects: { title: string | null; ai_script: { hook?: string; script?: string; cta?: string } | null } | null;
}

/** This week's Monday in the browser's own day, or next week's on a Sunday. */
function thisMonday(): string {
  const d = new Date();
  const wd = d.getDay();
  d.setDate(d.getDate() + (wd === 0 ? 1 : 1 - wd));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekLabel(monday: string): string {
  const [y, m, d] = monday.split("-").map(Number);
  const f = (t: Date) => t.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${f(new Date(y, m - 1, d))} – ${f(new Date(y, m - 1, d + 6))}`;
}

export default function AutopilotPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // How many of the week's 3 are videos; the rest are blog posts.
  const [videos, setVideos] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const monday = thisMonday();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await createClient()
      .from("autopilot_drafts")
      .select("id, week_of, slot_at, kind, topic, reason, requested, project_id, status, projects(title, ai_script)")
      .gte("week_of", monday)
      .order("slot_at");
    setDrafts((data ?? []) as unknown as Draft[]);
    setLoading(false);
  }, [user, monday]);

  useEffect(() => {
    void load();
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => setEligible(!!a && (a.isAdmin || PAID_TIERS.includes(a.tier))))
      .catch(() => setEligible(true));
  }, [load]);

  useEffect(() => {
    if (!user) return;
    createClient().from("profiles").select("autopilot_enabled, autopilot_videos").eq("id", user.id).single()
      .then(({ data }) => {
        const p = data as { autopilot_enabled?: boolean; autopilot_videos?: number } | null;
        setEnabled(p?.autopilot_enabled ?? true);
        setVideos(p?.autopilot_videos ?? 2);
      });
  }, [user]);

  // Watch drafts still being written.
  useEffect(() => {
    if (!drafts.some((d) => d.status === "writing")) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [drafts, load]);

  async function setStatus(d: Draft, status: Draft["status"]) {
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? { ...x, status } : x)));
    const { error } = await createClient().from("autopilot_drafts").update({ status }).eq("id", d.id);
    if (error) { toast.error("Couldn't save that. Try again."); void load(); return false; }
    return true;
  }

  function open(d: Draft) {
    if (!d.project_id) return;
    router.push(d.kind === "blog" ? `/create/${d.project_id}?step=5` : `/create/${d.project_id}`);
  }

  /**
   * Straight to the camera with the script in the teleprompter (2026-10-21,
   * the owner's ask), the same handoff My Sparks' Record again uses. Free:
   * a camera recording doesn't use a plan video.
   */
  async function recordMyself(d: Draft) {
    const s = d.projects?.ai_script;
    const script = [s?.hook, s?.script, s?.cta].map((x) => (x ?? "").trim()).filter(Boolean).join("\n\n");
    if (!script) { open(d); return; }
    if (!(await setStatus(d, "approved"))) return;
    try { sessionStorage.setItem("camera-record-script", script); } catch { /* sessionStorage unavailable */ }
    router.push("/create?tab=camera");
  }

  async function toggle() {
    if (!user || enabled === null) return;
    const next = !enabled;
    setEnabled(next);
    const { error } = await createClient().from("profiles").update({ autopilot_enabled: next }).eq("id", user.id);
    if (error) { setEnabled(!next); toast.error("Couldn't change that. Try again."); return; }
    toast.success(next ? "AutoSparks is on. New drafts every Sunday." : "AutoSparks is off.");
  }

  /** The weekly mix, chosen by the agent (2026-10-21, the owner's ask). */
  async function chooseMix(n: number) {
    if (!user) return;
    const before = videos;
    setVideos(n);
    const { error } = await createClient().from("profiles").update({ autopilot_videos: n }).eq("id", user.id);
    if (error) { setVideos(before); toast.error("Couldn't change that. Try again."); return; }
    toast.success("Saved. Your next AutoSparks will follow it.");
  }

  async function getIdeas() {
    const request = ask.trim();
    if (!request) { toast.error("Say or type what you'd like ideas about."); return; }
    setAsking(true);
    try {
      const res = await fetch("/api/autopilot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't get ideas. Try again.");
      setAsk("");
      toast.success("Writing your ideas. They'll appear here in about a minute.");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't get ideas. Try again.");
    } finally {
      setAsking(false);
    }
  }

  if (eligible === false) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <Sparkles className="mx-auto mb-3 text-spark-amber" size={32} />
        <h1 className="font-display text-2xl font-bold text-[#A3660F]">AutoSparks</h1>
        <p className="mt-2 text-sm text-spark-ink-muted">
          Each week SparkReels writes 3 posts for you to approve. AutoSparks is part of the paid plans.
        </p>
        <Link href="/settings/billing"><Button className="mt-5">See plans</Button></Link>
      </div>
    );
  }

  const live = drafts.filter((d) => d.status !== "skipped");
  const toReview = drafts.filter((d) => d.status === "draft").length;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight text-[#A3660F]">Your week</h1>
          <p className="text-sm text-spark-ink-muted">
            {weekLabel(monday)}{toReview > 0 && ` · ${toReview} to review`}
          </p>
        </div>
        {enabled !== null && (
          <button
            type="button"
            onClick={() => void toggle()}
            className="flex items-center gap-2 text-xs font-medium text-spark-ink-muted"
            aria-pressed={enabled}
          >
            <span className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-spark-amber" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${enabled ? "left-[18px]" : "left-0.5"}`} />
            </span>
            AutoSparks {enabled ? "on" : "off"}
          </button>
        )}
      </div>

      {/* The weekly mix (2026-10-21, the owner's ask). */}
      {videos !== null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-spark-ink-muted">Each week:</span>
          {[
            { n: 2, label: "2 videos + 1 blog" },
            { n: 1, label: "1 video + 2 blogs" },
            { n: 3, label: "3 videos" },
            { n: 0, label: "3 blogs" },
          ].map(({ n, label }) => (
            <button
              key={n}
              type="button"
              onClick={() => { if (n !== videos) void chooseMix(n); }}
              aria-pressed={videos === n}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                videos === n
                  ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]"
                  : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Ask for ideas (2026-10-21, the owner's ask). */}
      <div className="rounded-2xl border border-spark-rule bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-spark-ink">Ask for ideas</p>
        <div className="flex items-center gap-2">
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void getIdeas(); }}
            placeholder="First-time buyer tips, my open house Saturday…"
            maxLength={300}
            className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-sm text-spark-ink outline-none focus:border-spark-amber"
          />
          <FieldMic onTranscript={(t) => setAsk((s) => (s ? `${s} ${t}` : t))} title="Say what you'd like ideas about" />
          <Button size="sm" onClick={() => void getIdeas()} loading={asking} className="gap-1.5">
            <Sparkles size={14} /> Get ideas
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-spark-ink-faint">Up to 3 drafts each time, written in about a minute.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-spark-amber" /></div>
      ) : live.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-spark-rule bg-white/60 px-5 py-10 text-center">
          <p className="text-sm font-medium text-spark-ink">Your drafts arrive Sunday evening.</p>
          <p className="mt-1 text-xs text-spark-ink-muted">3 a week, written for your market. Or ask for ideas above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {drafts.map((d) => {
            const when = new Date(d.slot_at).toLocaleString(undefined, { weekday: "short", hour: "numeric" });
            const title = d.projects?.title || d.topic;
            const hook = d.projects?.ai_script?.hook;
            return (
              <div key={d.id} className={`rounded-2xl border border-spark-rule bg-white p-4 ${d.status === "skipped" ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-spark-ink-muted">
                  <span className="font-bold text-spark-ink">{when}</span>
                  <span className="flex items-center gap-1 rounded-full border border-spark-rule px-2 py-0.5">
                    {d.kind === "video" ? <><Video size={11} /> Video · Avatar in circle</> : <><FileText size={11} /> Blog post</>}
                  </span>
                  {d.requested && <span className="rounded-full bg-spark-amber-tint px-2 py-0.5 text-[#A3660F]">You asked</span>}
                </div>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug text-spark-ink">{title}</p>
                {hook && d.status !== "writing" && <p className="mt-0.5 line-clamp-2 text-[13px] text-spark-ink-muted">&ldquo;{hook}&rdquo;</p>}
                {d.reason && <p className="mt-1 text-[11.5px] text-spark-blue">Why: {d.reason}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  {d.status === "writing" && (
                    <span className="flex items-center gap-1.5 text-xs text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Writing…</span>
                  )}
                  {d.status === "failed" && (
                    <>
                      <span className="text-xs text-red-600">This one couldn&apos;t be written.</span>
                      <button onClick={() => void setStatus(d, "skipped")} className="text-xs font-medium text-spark-ink-muted underline">Remove</button>
                    </>
                  )}
                  {d.status === "draft" && (
                    <>
                      <Button size="sm" onClick={async () => { if (await setStatus(d, "approved")) open(d); }}>Approve</Button>
                      {d.kind === "video" && (
                        <Button size="sm" variant="outline" onClick={() => void recordMyself(d)} className="gap-1.5">
                          <Camera size={13} /> Record it myself
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => open(d)}>Change</Button>
                      <Button size="sm" variant="ghost" onClick={() => void setStatus(d, "skipped")}>Skip</Button>
                    </>
                  )}
                  {d.status === "approved" && (
                    <>
                      <span className="flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700"><Check size={13} /> Approved</span>
                      <button onClick={() => open(d)} className="text-xs font-semibold text-primary-600">Open →</button>
                    </>
                  )}
                  {d.status === "skipped" && (
                    <button onClick={() => void setStatus(d, d.project_id ? "draft" : "failed")} className="text-xs font-medium text-spark-ink-muted underline">Skipped · Undo</button>
                  )}
                </div>
              </div>
            );
          })}
          <p className="text-center text-[11px] text-spark-ink-faint">
            Approve opens it ready to make. Nothing is made or posted until you do.
          </p>
        </div>
      )}
    </div>
  );
}
