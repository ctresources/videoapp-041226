"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { availableFor, type VideoKind } from "@/lib/utils/video-allowance";
import { AlertTriangle, Globe, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface TranslateModalProps {
  videoId: string;
  videoTitle: string;
  /**
   * Which allowance the dub will be charged to — HeyGen bills a translation as
   * its own render, so it costs the same kind of credit the source video did.
   */
  videoKind: VideoKind;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TranslateModal({
  videoId, videoTitle, videoKind, onClose, onSubmitted,
}: TranslateModalProps) {
  const [languages, setLanguages] = useState<string[]>([]);
  const [loadingLanguages, setLoadingLanguages] = useState(true);
  const [language, setLanguage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const kindLabel = videoKind === "long" ? "long" : "short";

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

  // Read the same balance the translate route will charge, so the modal can
  // state the cost against what the user actually has rather than after a 402.
  //
  // The id filter is required, not decorative: profiles carries an "Admins read
  // all profiles" policy alongside the own-row one, and RLS policies are OR'd —
  // so an unfiltered .single() matches every row for an admin and errors.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("credits_remaining, long_credits_remaining, purchased_short_videos, purchased_long_videos, role")
        .eq("id", user.id)
        .single();
      if (cancelled || !data) return;
      const p = data as {
        credits_remaining: number;
        long_credits_remaining: number;
        purchased_short_videos: number;
        purchased_long_videos: number;
        role: string | null;
      };
      setIsAdmin(p.role === "admin");
      setBalance(availableFor(p, videoKind));
    })();
    return () => { cancelled = true; };
  }, [videoKind]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, submitting]);

  // Admins are never charged (the route skips the deduction for them), so the
  // gate must skip them too — otherwise an admin at zero sees a disabled button
  // for a request the server would happily accept.
  const outOfCredits = !isAdmin && balance !== null && balance < 1;

  async function handleSubmit() {
    if (!language || outOfCredits) return;
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

          {/* Cost is the thing a user must not miss — a dub is a fresh HeyGen
              render, billed like a new video, not a free re-export.
              Worded in "videos", never "credits": that is the unit the rest of
              the app uses ("You have no short videos left"), and naming a
              second unit here reads as a separate currency the user has to
              go and buy. */}
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">
              This uses 1 of your {kindLabel} videos
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              HeyGen renders the dub from scratch, so it costs the same as making a new video.
              {isAdmin
                ? " Admin accounts aren't charged."
                : balance !== null && ` You have ${balance} left — and if it fails, you get it back.`}
            </p>
          </div>

          <p className="text-sm text-slate-500 mb-4">
            HeyGen re-voices the narration in the new language, using HeyGen’s translation voice, and
            re-syncs the avatar's mouth to match.
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
                disabled={submitting || outOfCredits}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-slate-50"
              >
                {languages.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            )}
          </div>

          {/* Any captions burned into the source stay in their original
              language — HeyGen dubs the audio, it cannot repaint pixels. */}
          <p className="mb-5 flex gap-2 text-xs text-slate-500">
            <AlertTriangle size={13} className="shrink-0 mt-0.5 text-slate-400" />
            <span>
              On-screen captions stay in the original language — only the spoken audio is translated.
            </span>
          </p>

          {outOfCredits ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
              <Link href="/billing" className="flex-1">
                <Button className="w-full">Get more videos</Button>
              </Link>
            </div>
          ) : (
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
                    <Globe size={14} /> Translate · uses 1 video
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
