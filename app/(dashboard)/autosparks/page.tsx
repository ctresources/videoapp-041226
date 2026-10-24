"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, FileText, Loader2, Sparkles, Video } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { FieldMic } from "@/components/ui/field-mic";
import { ListenButton } from "@/components/ui/listen-button";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";
import { PAID_TIERS } from "@/lib/utils/plan-features";
import { useHalo } from "@/components/halo/use-halo";
import { HaloDrafts } from "@/components/halo/halo-drafts";
import { OutOfVideosModal } from "@/components/out-of-videos-modal";

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
  projects: {
    title: string | null;
    ai_script: {
      hook?: string; script?: string; cta?: string;
      blog_intro?: string; blog_body?: string; blog_conclusion?: string;
    } | null;
  } | null;
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
  // The days (0 = Sun … 6 = Sat) and time the drafts are set for.
  const [days, setDays] = useState<number[] | null>(null);
  const [time, setTime] = useState("09:00");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const monday = thisMonday();
  // Halo sites and their drafts (2026-10-24), shown on this page with their own list.
  const halo = useHalo(user?.id);
  // Videos left this month, and the Upgrade / Buy popup (2026-10-24, the owner's ask).
  const [allowance, setAllowance] = useState<{
    unlimited: boolean; short: number; tier: string;
    shortPlanLeft: number; shortBought: number; shortPerMonth: number;
  } | null>(null);
  const [outOfVideos, setOutOfVideos] = useState(false);
  const loadAllowance = useCallback(() => {
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => { if (a) setAllowance(a); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await createClient()
      .from("autopilot_drafts")
      .select("id, week_of, slot_at, kind, topic, reason, requested, project_id, status, projects(title, ai_script)")
      .gte("week_of", monday)
      // Halo drafts share the table; they have their own list below.
      .eq("source", "autosparks")
      .order("slot_at");
    setDrafts((data ?? []) as unknown as Draft[]);
    setLoading(false);
  }, [user, monday]);

  useEffect(() => {
    void load();
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => {
        setEligible(!!a && (a.isAdmin || PAID_TIERS.includes(a.tier)));
        if (a) setAllowance(a);
      })
      .catch(() => setEligible(true));
  }, [load]);

  /**
   * Which video drafts the agent has no video left for (2026-10-24): every
   * video draft still to approve, AutoSparks and Halo alike, in date order;
   * the ones past the videos left are marked "Needs 1 more video", and their
   * Approve opens the Upgrade / Buy popup.
   */
  const needsVideo = new Set<string>();
  if (allowance && !allowance.unlimited) {
    const pending = [
      ...drafts.filter((d) => d.kind === "video" && d.status === "draft").map((d) => ({ id: d.id, at: d.slot_at })),
      ...halo.drafts.filter((d) => d.status === "draft").map((d) => ({ id: d.id, at: d.slot_at })),
    ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    pending.slice(Math.max(0, allowance.short)).forEach((p) => needsVideo.add(p.id));
  }
  // A Halo video was approved, so a video was used: show the new count.
  const haloApproved = halo.drafts.filter((d) => d.status !== "draft" && d.status !== "writing").length;
  useEffect(() => { loadAllowance(); }, [haloApproved, loadAllowance]);

  useEffect(() => {
    if (!user) return;
    createClient().from("profiles").select("autopilot_enabled, autopilot_videos, autopilot_days, autopilot_time").eq("id", user.id).single()
      .then(({ data }) => {
        const p = data as { autopilot_enabled?: boolean; autopilot_videos?: number; autopilot_days?: number[]; autopilot_time?: string } | null;
        setEnabled(p?.autopilot_enabled ?? true);
        setVideos(p?.autopilot_videos ?? 1);
        setDays(p?.autopilot_days?.length ? p.autopilot_days : [2, 4, 6]);
        setTime(p?.autopilot_time ?? "09:00");
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

  /** Which days, saved once three are picked (2026-10-21, the owner's ask). */
  async function toggleDay(d: number) {
    if (!user || !days) return;
    const on = days.includes(d);
    if (!on && days.length >= 3) { toast("Pick 3 days. Tap one to turn it off first."); return; }
    const next = on ? days.filter((x) => x !== d) : [...days, d].sort();
    setDays(next);
    if (next.length !== 3) return;
    const { error } = await createClient().from("profiles").update({ autopilot_days: next }).eq("id", user.id);
    if (error) { toast.error("Couldn't save the days. Try again."); return; }
    toast.success("Saved. Your next AutoSparks will use these days.");
  }

  async function chooseTime(t: string) {
    if (!user) return;
    const before = time;
    setTime(t);
    const { error } = await createClient().from("profiles").update({ autopilot_time: t }).eq("id", user.id);
    if (error) { setTime(before); toast.error("Couldn't save the time. Try again."); return; }
    toast.success("Saved.");
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
          {/* Videos left this month (2026-10-24, the owner's ask). */}
          {allowance && !allowance.unlimited && (
            <p className="mt-0.5 text-[13px] text-spark-ink-muted">
              Videos left this month:{" "}
              <b className={allowance.short > 0 ? "text-spark-ink" : "text-red-600"}>
                {allowance.shortPlanLeft} of {allowance.shortPerMonth}
              </b>
              {allowance.shortBought > 0 && ` · ${allowance.shortBought} bought`}
              {" · "}
              <Link href="/billing#add-ons" className="font-semibold text-spark-blue">Get more</Link>
            </p>
          )}
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
            { n: 1, label: "1 video + 2 blogs" },
            { n: 2, label: "2 videos + 1 blog" },
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

      {/* Which days, and what time (2026-10-21, the owner's ask). */}
      {days !== null && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs font-medium text-spark-ink-muted">Post on:</span>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void toggleDay(d)}
              aria-pressed={days.includes(d)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                days.includes(d)
                  ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]"
                  : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
              }`}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}
            </button>
          ))}
          <span className="ml-1 text-xs text-spark-ink-muted">at</span>
          <select
            value={time}
            onChange={(e) => void chooseTime(e.target.value)}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-xs text-spark-ink outline-none focus:border-spark-amber"
          >
            {Array.from({ length: 15 }, (_, i) => i + 6).map((h) => {
              const v = `${String(h).padStart(2, "0")}:00`;
              return <option key={v} value={v}>{h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</option>;
            })}
          </select>
          {days.length !== 3 && <span className="text-[11px] text-spark-amber">Pick 3 days</span>}
        </div>
      )}

      {/* Halo sites moved to Settings after CRM Integration (2026-10-24, the
          owner's mockup); a link for agents who have one, above their drafts. */}
      {halo.loaded && halo.sites.length > 0 && (
        <Link href="/settings#halo" className="-mb-2 self-end text-[13px] font-semibold text-[#A3660F] hover:underline">
          Halo settings →
        </Link>
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

      <HaloDrafts halo={halo} needsVideo={needsVideo} onOutOfVideos={() => setOutOfVideos(true)} />
      {halo.drafts.length > 0 && (
        <p className="mt-1 text-xs font-bold uppercase tracking-[.12em] text-spark-ink-faint">AutoSparks</p>
      )}

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
                  {needsVideo.has(d.id) && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">Needs 1 more video</span>}
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
                      <Button size="sm" onClick={async () => {
                        // No video left for it: the Upgrade / Buy popup instead (2026-10-24).
                        if (needsVideo.has(d.id)) { setOutOfVideos(true); return; }
                        if (await setStatus(d, "approved")) open(d);
                      }}>Approve</Button>
                      {d.kind === "video" && (
                        <Button size="sm" variant="outline" onClick={() => void recordMyself(d)} className="gap-1.5">
                          <Camera size={13} /> Record it myself
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => open(d)}>Change</Button>
                      <Button size="sm" variant="ghost" onClick={() => void setStatus(d, "skipped")}>Skip</Button>
                      {/* Hear a draft before approving it (2026-10-21). */}
                      <ListenButton
                        text={(d.kind === "video"
                          ? [d.projects?.ai_script?.hook, d.projects?.ai_script?.script, d.projects?.ai_script?.cta]
                          : [d.projects?.ai_script?.blog_intro, d.projects?.ai_script?.blog_body, d.projects?.ai_script?.blog_conclusion]
                        ).filter(Boolean).join("\n\n")}
                      />
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
      {/* Upgrade or buy one more (2026-10-24): the same popup the editor shows. */}
      {outOfVideos && (
        <OutOfVideosModal kind="short" tier={allowance?.tier ?? "free"} onClose={() => setOutOfVideos(false)} />
      )}
    </div>
  );
}
