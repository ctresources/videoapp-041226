"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Copy, Loader2, Send } from "lucide-react";

/**
 * An email ready to use (2026-10-15): the preview, as the inbox will show it,
 * and the three ways out of SparkReels — Copy as HTML, Copy as text, and Send
 * me a test (only ever to the signed-in agent). Shared by the newsletter and
 * the Seller Update, and built like the Share Kit's email version.
 */
export function EmailResult({ subject, html, text }: { subject: string; html: string; text: string }) {
  const [sending, setSending] = useState(false);
  const [height, setHeight] = useState(520);

  async function sendTest() {
    setSending(true);
    try {
      const res = await fetch("/api/email/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, html, text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't send the test email.");
      toast.success(`Test sent to ${data.to}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the test email.");
    } finally {
      setSending(false);
    }
  }

  const btn = "flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50";
  return (
    <div className="flex flex-1 flex-col">
      <iframe
        title="Email preview"
        srcDoc={html}
        sandbox="allow-same-origin"
        className="w-full flex-1 rounded-xl border border-spark-rule bg-white"
        style={{ minHeight: height }}
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument;
          if (doc?.body) setHeight(Math.min(1400, doc.body.scrollHeight + 8));
        }}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btn} spark-cta-gradient text-white`}
          onClick={() => { navigator.clipboard.writeText(html); toast.success("Email HTML copied. Paste it into your email tool's HTML or code view."); }}
        >
          <Copy size={13} /> Copy as HTML
        </button>
        <button
          type="button"
          className={`${btn} border border-spark-rule bg-white text-spark-ink`}
          onClick={() => { navigator.clipboard.writeText(text); toast.success("Email text copied."); }}
        >
          <Copy size={13} /> Copy as text
        </button>
        <button type="button" className={`${btn} bg-spark-ink text-white`} onClick={sendTest} disabled={sending}>
          {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send me a test
        </button>
      </div>
    </div>
  );
}

/** A choice of subject line, as radio rows. */
export function SubjectPicker({ subjects, value, onChange }: { subjects: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      {subjects.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-[14px] transition-colors ${
            i === value ? "border-[#A3660F] bg-[#fdf3e2] text-spark-ink" : "border-spark-rule bg-white text-spark-ink-soft hover:border-[#d9c6a8]"
          }`}
        >
          <span className={`h-3 w-3 shrink-0 rounded-full border-[1.5px] ${i === value ? "border-[#A3660F] bg-[#A3660F]" : "border-[#c9b79c]"}`} />
          {s}
        </button>
      ))}
    </div>
  );
}
