"use client";

import { Button } from "@/components/ui/button";
import { Globe, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TranslateModalProps {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TranslateModal({ videoId, videoTitle, onClose, onSubmitted }: TranslateModalProps) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [language, setLanguage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/video/translate")
      .then((r) => r.json())
      .then((d) => {
        const langs: string[] = d.languages || [];
        setLanguages(langs);
        if (langs.length) setLanguage(langs[0]);
      })
      .catch(() => toast.error("Couldn't load available languages"))
      .finally(() => setLoadingLanguages(false));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, submitting]);

  async function handleSubmit() {
    if (!language) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/video/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translation failed to start");

      toast.success(`Translating to ${language} — it'll appear in your videos when ready.`);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Translation failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600" />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
                <Globe size={22} className="text-primary-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-brand-text">Translate this video</h3>
                <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{videoTitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-sm text-slate-500 mb-4">
            HeyGen re-voices the narration in the new language and lip-syncs the avatar to match.
            This uses 1 video credit, same as creating a new video.
          </p>

          <div className="mb-5">
            <label className="block text-xs font-medium text-slate-600 mb-2">Target language</label>
            {loadingLanguages ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading languages…
              </div>
            ) : languages.length === 0 ? (
              <p className="text-sm text-red-500">Couldn't load languages — try again shortly.</p>
            ) : (
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-slate-50"
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !language}
              className="flex-1 gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Starting…
                </>
              ) : (
                <>
                  <Globe size={14} /> Translate
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
