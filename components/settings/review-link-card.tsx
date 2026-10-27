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

  useEffect(() => {
    createClient().from("profiles").select("google_review_url").eq("id", userId).single()
      .then(({ data }) => {
        const v = (data as { google_review_url: string | null } | null)?.google_review_url ?? "";
        setUrl(v); setSaved(v);
      });
  }, [userId]);

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
    </Card>
  );
}
