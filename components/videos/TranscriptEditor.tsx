"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Loader2, Save, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import type { SrtCue } from "@/lib/utils/srt";

/**
 * Read back what a video says, and correct it.
 *
 * The honest limit is stated at the top of the panel rather than buried: this
 * edits the words that are WRITTEN about the video — the captions, the .srt,
 * the copy it publishes with — and not the audio, which already contains
 * whatever was said. Someone opening a "transcript editor" to fix a stumble
 * will otherwise reasonably assume they have fixed the video.
 *
 * Lines are edited one cue at a time with their timestamps alongside. A single
 * free-text box would read better but the timings would have nothing to attach
 * to on the way back, and the captions would come apart.
 */
export function TranscriptEditor({ videoId, title, onClose }: {
  videoId: string;
  title: string;
  onClose: () => void;
}) {
  const [cues, setCues] = useState<SrtCue[] | null>(null);
  const [original, setOriginal] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/video/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not read the transcript");
        if (!live) return;
        setCues(data.cues as SrtCue[]);
        setOriginal((data.cues as SrtCue[]).map((c) => c.text));
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : "Could not read the transcript");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [videoId]);

  const dirty = cues !== null && cues.some((c, i) => c.text !== original[i]);

  async function save() {
    if (!cues) return;
    setSaving(true);
    try {
      const res = await fetch("/api/video/transcript", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, cues }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setOriginal(cues.map((c) => c.text));
      toast.success("Transcript saved — your .srt download now matches.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // A correction takes real typing; closing it by a stray click on the
  // backdrop would throw that away, so only the buttons close this.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-brand-text">Transcript</p>
            <p className="mt-0.5 truncate text-xs text-slate-400">{title}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Said before anything is typed, not after it is saved. */}
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12px] leading-[1.45] text-amber-900">
            This corrects the <strong>.srt caption file you download</strong> — not the audio, and
            not the captions already burned into this video. The recording still says what it said;
            to change that, the narration has to be re-recorded over the footage.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 size={15} className="animate-spin text-spark-amber" />
              Transcribing this video — the first time takes a moment.
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[12.5px] leading-[1.45] text-amber-900">{error}</p>
            </div>
          )}

          {cues && cues.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {cues.map((cue, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-2 w-[52px] shrink-0 font-mono text-[10.5px] tabular-nums text-slate-400">
                    {cue.start.slice(3, 8)}
                  </span>
                  <textarea
                    value={cue.text}
                    rows={1}
                    onChange={(e) => {
                      const text = e.target.value;
                      setCues((prev) => prev!.map((c, j) => (j === i ? { ...c, text } : c)));
                    }}
                    className={`min-h-[34px] flex-1 resize-y rounded-lg border px-2.5 py-1.5 text-[13px] leading-[1.45] text-spark-ink outline-none focus:border-spark-amber ${
                      cue.text !== original[i] ? "border-spark-amber bg-spark-amber-tint" : "border-slate-200"
                    }`}
                  />
                </div>
              ))}
              <p className="mt-2 text-[11px] leading-[1.45] text-slate-400">
                Timings stay as they are — only the words change. Clearing a line removes it.
              </p>
            </div>
          )}

          {cues && cues.length === 0 && !loading && (
            <p className="py-8 text-sm text-slate-500">No speech was found in this video.</p>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-slate-100 px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            {dirty ? "Discard changes" : "Close"}
          </Button>
          <Button className="flex-1 gap-2" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving…" : "Save transcript"}
          </Button>
        </div>
      </div>
    </div>
  );
}
