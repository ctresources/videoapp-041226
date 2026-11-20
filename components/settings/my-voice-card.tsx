"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";

/**
 * My voice in Settings (2026-11-18, the owner's approved mockup): the "how I
 * talk" note every script follows, what it was learned from, a switch to stop
 * learning, and Edit. Sits at the foot of section 5, beside the closing line,
 * so the numbered sections keep their numbers.
 */

type Sources = { pasted?: number; recordings?: number; edits?: number; picks?: number };
const LABELS: [keyof Sources, string, string][] = [
  ["pasted", "script you pasted", "scripts you pasted"],
  ["recordings", "recording", "recordings"],
  ["edits", "edit", "edits"],
  ["picks", "pick", "picks"],
];

export function MyVoiceCard() {
  const [note, setNote] = useState<string | null>(null);
  const [learning, setLearning] = useState(true);
  const [sources, setSources] = useState<Sources>({});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const apply = (d: { note?: string | null; learning?: boolean; sources?: Sources }) => {
    setNote(d.note ?? null);
    setLearning(d.learning !== false);
    setSources(d.sources ?? {});
  };

  useEffect(() => {
    fetch("/api/profile/my-voice").then((r) => r.json()).then(apply).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  async function save(patch: { note?: string; learning?: boolean }) {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/my-voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      apply(d);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setSaving(false); }
  }

  if (!loaded) return null;
  const chips = LABELS.filter(([k]) => (sources[k] ?? 0) > 0).map(([k, one, many]) => `${sources[k]} ${sources[k] === 1 ? one : many}`);

  return (
    <div id="my-voice" className="mt-6 scroll-mt-28 border-t border-spark-rule-soft pt-5">
      <h4 className="font-semibold text-brand-text">My voice</h4>
      <p className="mt-0.5 text-xs text-slate-400">Every script is written the way you talk.</p>

      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder='e.g. Warm and direct, like a neighbour. Short sentences. Ends with "Call or text me anytime."'
            className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <div className="flex items-center gap-3">
            <Button type="button" loading={saving} onClick={() => void save({ note: draft })}>Save</Button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700">
          {note ?? <span className="text-slate-400">Not learned yet. It fills in as you paste scripts, record, and pick versions.</span>}
        </div>
      )}

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => <span key={c} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">{c}</span>)}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={learning} disabled={saving} onChange={(e) => void save({ learning: e.target.checked })} className="h-4 w-4 accent-[#B9770E]" />
          Keep learning
        </label>
        {!editing && (
          <button type="button" onClick={() => { setDraft(note ?? ""); setEditing(true); }} className="text-sm font-semibold text-spark-amber hover:opacity-80">
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
