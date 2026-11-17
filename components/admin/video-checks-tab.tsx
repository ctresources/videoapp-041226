"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Admin → Video checks (2026-11-15, the owner's approved mockup #2): every
 * check, what it found and what it did, the "Fix and hold for everyone"
 * switch (off: admin accounts only), and this month's Gemini use.
 */
interface Check {
  id: string; title: string; agent: string; mode: "enforce" | "record";
  status: "ok" | "problems" | "error"; problems: { at: string; what: string; kind: string }[];
  action: string | null; created_at: string;
}
interface Data { everyone: boolean; checks: Check[]; usage: Record<string, number>; searchCap: number }

const ACTION: Record<string, string> = {
  refinished: "redone",
  remake_offered: "free remake offered",
  would_refinish: "would have been fixed",
  would_offer_remake: "would offer a free remake",
};

export function VideoChecksTab() {
  const [data, setData] = useState<Data | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/video-checks").then((r) => (r.ok ? r.json() : null)).then((d) => setData(d)).catch(() => setData(null));
  }, []);

  async function toggle() {
    if (!data) return;
    const next = !data.everyone;
    if (next && !window.confirm("Fix and hold videos for everyone, not just admin accounts?")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/video-checks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ everyone: next }) });
      if (!res.ok) throw new Error();
      setData({ ...data, everyone: next });
    } catch {
      toast.error("Couldn't change it.");
    } finally { setSaving(false); }
  }

  if (!data) return <Card><p className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading…</p></Card>;

  const u = data.usage;
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  const checked = u.video_checks ?? 0;
  const fixed = data.checks.filter((c) => c.action === "refinished").length;
  const remakes = data.checks.filter((c) => c.action === "remake_offered").length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-brand-text">Video checks</h3>
          <button
            type="button" onClick={toggle} disabled={saving}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${data.everyone ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 text-slate-500"}`}
          >
            Fix and hold for everyone: {data.everyone ? "On" : "Off · admins only"}
          </button>
        </div>
        {data.checks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No videos checked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 font-medium">Video</th>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 font-medium">Result</th>
                  <th className="pb-2 font-medium">Found</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium text-slate-800">{c.title}</td>
                    <td className="py-2 pr-3 text-slate-600">{c.agent}</td>
                    <td className="py-2 pr-3">
                      {c.status === "ok" ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">Looks good</span>
                        : c.status === "error" ? <span className="text-xs text-slate-400">Couldn&apos;t check</span>
                          : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">{c.problems.length} problem{c.problems.length === 1 ? "" : "s"}</span>}
                    </td>
                    <td className="py-2 text-slate-600">
                      {c.problems.map((p) => `${p.at ? `${p.at} ` : ""}${p.what}`).join(" · ") || <span className="text-slate-400">—</span>}
                      {c.action && <i className="text-slate-400"> · {ACTION[c.action] ?? c.action}</i>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[13px] text-slate-400">
          {month}: {checked} video{checked === 1 ? "" : "s"} checked · {fixed} fixed · {remakes} remake{remakes === 1 ? "" : "s"} offered
        </p>
      </Card>
      <Card>
        <h4 className="mb-2 font-semibold text-brand-text">Gemini this month</h4>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <span>Google searches: <b>{u.searches ?? 0}</b> of {data.searchCap} free</span>
          <span>Photo touch-ups: <b>{u.images ?? 0}</b></span>
          <span>Video checks: <b>{u.video_checks ?? 0}</b></span>
          <span>Take tips: <b>{u.take_tips ?? 0}</b></span>
          <span>Photo sorts: <b>{u.photo_sorts ?? 0}</b></span>
          <span>Moving photos: <b>{u.video_seconds ?? 0}</b> seconds</span>
        </div>
        <p className="mt-2 text-[13px] text-slate-400">
          About ${(((u.images ?? 0) * 5 + (u.video_checks ?? 0) * 1.5 + (u.take_tips ?? 0) * 1.5 + (u.photo_sorts ?? 0) * 0.5 + (u.video_seconds ?? 0) * 7) / 100).toFixed(2)} so far. Research stops using Google searches at {data.searchCap}.
        </p>
      </Card>
    </div>
  );
}
