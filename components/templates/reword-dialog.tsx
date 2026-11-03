"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Edit the words" on a template video in My Sparks (2026-11-02, the owner's
 * mockup): change any word on screen and press Update. The same video with
 * new words, in about a minute; no new video used.
 */
interface Field { key: string; label: string; placeholder?: string }

export function RewordButton({ videoId, design, fields: start, onDone }: {
  videoId: string; design: string; fields: Record<string, string>; onDone: (videoUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [defs, setDefs] = useState<Field[] | null>(null);
  const [fields, setFields] = useState<Record<string, string>>(start);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || defs) return;
    fetch("/api/templates").then((r) => (r.ok ? r.json() : null))
      .then((s) => setDefs((s?.designs ?? []).find((d: { id: string }) => d.id === design)?.fields ?? []))
      .catch(() => setDefs([]));
  }, [open, defs, design]);

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reword", videoId, fields }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(out.error || "Couldn't change the words."); return; }
      onDone(out.videoUrl);
      toast.success("Words updated.");
      setOpen(false);
    } finally { setBusy(false); }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>Edit the words</Button>
      {open && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-white p-5">
            <div className="mb-2 flex items-center">
              <b className="text-[18px] text-spark-ink">Edit the words</b>
              <button type="button" aria-label="Close" onClick={() => !busy && setOpen(false)} className="ml-auto text-spark-ink-muted"><X size={18} /></button>
            </div>
            <p className="mb-3 text-[14px] text-spark-ink-muted">Ready in about a minute. No new video used.</p>
            {!defs ? <Loader2 className="animate-spin text-spark-amber" /> : defs.map((f) => (
              <label key={f.key} className="mb-2 block">
                <span className="mb-1 block text-[14px] font-semibold text-spark-ink-soft">{f.label}</span>
                <input className="w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] outline-none focus:border-[#A3660F]"
                  value={fields[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
              </label>
            ))}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void save()} loading={busy}>Update the words</Button>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="rounded-xl border border-spark-rule px-4 py-2 text-[15px] font-semibold">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
