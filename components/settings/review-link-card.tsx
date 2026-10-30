"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Your Google review link (2026-10-27), for Ask for Google Review Video
 * Email: the gold "Leave me a Google review" button in the email opens it.
 */
export function ReviewLinkCard({ userId }: { userId: string }) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  // Default words for the review request (2026-10-30, the owner's ask): the
  // same ones the tool's "Save as my default" saves.
  const [words, setWords] = useState("");
  const [subject, setSubject] = useState("");
  const [savedWords, setSavedWords] = useState({ words: "", subject: "" });
  const [savingWords, setSavingWords] = useState(false);

  useEffect(() => {
    createClient().from("profiles").select("google_review_url, review_request_defaults").eq("id", userId).single()
      .then(({ data }) => {
        const row = data as { google_review_url: string | null; review_request_defaults: { script?: string; subject?: string } | null } | null;
        const v = row?.google_review_url ?? "";
        setUrl(v); setSaved(v);
        const w = row?.review_request_defaults?.script ?? "";
        const sub = row?.review_request_defaults?.subject ?? "";
        setWords(w); setSubject(sub); setSavedWords({ words: w, subject: sub });
      });
  }, [userId]);

  async function saveWords() {
    setSavingWords(true);
    const r = await fetch("/api/review-request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "defaults", script: words, subject }),
    }).catch(() => null);
    setSavingWords(false);
    if (!r?.ok) { toast.error("Couldn't save them. Try again."); return; }
    setSavedWords({ words: words.trim(), subject: subject.trim() });
    toast.success(words.trim() || subject.trim() ? "Default words saved." : "Default words cleared.");
  }

  const clean = url.trim();
  const valid = !clean || /^https:\/\/\S+\.\S+/.test(clean);

  async function save() {
    if (!valid) { toast.error("Paste the whole link, starting with https://"); return; }
    setSaving(true);
    const { error } = await createClient().from("profiles").update({ google_review_url: clean || null }).eq("id", userId);
    setSaving(false);
    if (error) { toast.error("Couldn't save it. Try again."); return; }
    setSaved(clean);
    toast.success(clean ? "Review link saved." : "Review link removed.");
  }

  return (
    <Card id="review-link" className="scroll-mt-28">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-spark-amber-tint">
          <Star size={18} className="text-spark-amber" />
        </div>
        <h2 className="font-semibold text-brand-text">Your Google review link</h2>
      </div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://g.page/r/…/review"
        inputMode="url"
        className={`w-full rounded-xl border px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-spark-amber ${valid ? "border-spark-rule" : "border-red-300"}`}
      />
      <p className="mt-2 text-[13px] text-spark-ink-muted">
        Where to find it: your Google Business Profile → <strong>Ask for reviews</strong> → <strong>Copy link</strong>.
        It&apos;s the button in your Ask for Google Review Video Email.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={clean === saved}>Save</Button>
        {saved && (
          <a href={saved} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">Test the link</Button>
          </a>
        )}
      </div>

      <div className="mt-5 border-t border-spark-rule pt-4">
        <p className="font-semibold text-brand-text">Your default review request words</p>
        <p className="mt-0.5 text-[13px] text-spark-ink-muted">Filled in every time you ask for a review, in Spark Tools.</p>
        <label className="mt-3 block text-[13px] font-semibold text-spark-ink-soft">Video words</label>
        <textarea
          rows={4}
          value={words}
          onChange={(e) => setWords(e.target.value)}
          placeholder="Hi! It was such a pleasure helping you with your move. If you have a minute, would you leave me a quick Google review?…"
          className="mt-1 w-full resize-none rounded-xl border border-spark-rule px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-spark-amber"
        />
        <label className="mt-2 block text-[13px] font-semibold text-spark-ink-soft">Email subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Would you leave me a quick review?"
          className="mt-1 w-full rounded-xl border border-spark-rule px-3.5 py-2.5 text-[15px] outline-none focus:ring-2 focus:ring-spark-amber"
        />
        <p className="mt-1.5 text-[12.5px] text-spark-ink-muted">The email&apos;s note starts with &ldquo;Hi {"{first name}"},&rdquo; and follows the video words.</p>
        <Button size="sm" className="mt-3" onClick={() => void saveWords()} loading={savingWords}
          disabled={words.trim() === savedWords.words && subject.trim() === savedWords.subject}>
          Save words
        </Button>
      </div>
    </Card>
  );
}
