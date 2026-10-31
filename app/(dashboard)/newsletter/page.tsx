"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { EmailResult, SubjectPicker } from "@/components/email/email-result";
import { BoldTrailSend, postBoldTrailEmail } from "@/components/email/boldtrail-send";
import { newsletterAsHtml, newsletterAsText, type Newsletter } from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";
import { showTrialLock } from "@/lib/utils/trial-lock";

/**
 * A newsletter from two to five blog posts, picked in My Sparks
 * (/newsletter?posts=id,id,id), at the owner's ask (2026-10-15). Copied into
 * the agent's own email tool like the Share Kit's email version; SparkReels
 * only ever sends a test to the agent.
 */

type Post = { id: string; title: string; url: string };

const eyebrow = "mb-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-spark-ink";

export default function NewsletterPage() {
  const [ids, setIds] = useState<string[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<EmailSignature>({});
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null);
  const [subjectIdx, setSubjectIdx] = useState(0);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "load" | "write", projectIds: string[]) {
    const res = await fetch("/api/ai/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds, action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (showTrialLock(data)) return null;
      throw new Error(data?.error || "Couldn't write the newsletter.");
    }
    return data as { posts: Post[]; signature: EmailSignature; newsletter?: Newsletter };
  }

  async function write(projectIds = ids) {
    setWriting(true);
    setError(null);
    try {
      const data = await call("write", projectIds);
      if (data?.newsletter) {
        setNewsletter(data.newsletter);
        setSubjectIdx(0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't write the newsletter.");
    } finally {
      setWriting(false);
    }
  }

  // The posts picked in My Sparks come in the address; the window keeps this
  // page free of a useSearchParams Suspense boundary.
  useEffect(() => {
    const picked = (new URLSearchParams(window.location.search).get("posts") ?? "").split(",").filter(Boolean);
    setIds(picked);
    (async () => {
      try {
        const data = await call("load", picked);
        if (!data) return;
        setPosts(data.posts);
        setSignature(data.signature);
        setUrls(Object.fromEntries(data.posts.map((p) => [p.id, p.url ?? ""])));
        await write(picked);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open those posts.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Saved on the post itself, so its own email version uses the same link. */
  async function saveUrl(id: string) {
    const value = (urls[id] ?? "").trim();
    if (value === (posts.find((p) => p.id === id)?.url ?? "")) return;
    const res = await fetch("/api/ai/email-version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, action: "save_url", blogUrl: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data?.error || "Couldn't save the link."); return; }
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, url: value } : p)));
  }

  const subject = newsletter?.subjects[Math.min(subjectIdx, newsletter.subjects.length - 1)] ?? "";
  const built = useMemo(() => {
    if (!newsletter) return null;
    return {
      html: newsletterAsHtml(newsletter, { subject, urls, signature }),
      text: newsletterAsText(newsletter, { urls, signature }),
    };
  }, [newsletter, subject, urls, signature]);

  return (
    <div className="w-full px-4 pb-10 pt-5 sm:px-6">
      <Link href="/videos" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-spark-ink-muted hover:text-spark-ink">
        <ArrowLeft size={15} /> My Sparks
      </Link>
      <h1 className="mb-4 font-display text-[28px] font-bold leading-[1.15] text-[#A3660F] sm:text-[32px]">Your newsletter</h1>

      {error && !newsletter && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-700">
          {error}{" "}
          {ids.length >= 2 && <button type="button" onClick={() => write()} className="font-semibold underline">Try again</button>}
        </div>
      )}

      {!newsletter ? (
        !error && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-spark-rule bg-white px-5 py-8 text-[15px] text-spark-ink-muted">
            <Loader2 size={18} className="animate-spin text-[#A3660F]" /> Writing your newsletter from {posts.length || ids.length} posts…
          </div>
        )
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <p className={eyebrow}>Subject line</p>
            <SubjectPicker subjects={newsletter.subjects} value={subjectIdx} onChange={setSubjectIdx} />
            {newsletter.preview && (
              <>
                <p className={`${eyebrow} mt-4`}>Inbox preview</p>
                <p className="rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[14px] text-spark-ink-soft">{newsletter.preview}</p>
              </>
            )}
            <p className={`${eyebrow} mt-4`}>Post links</p>
            <div className="flex flex-col gap-2.5">
              {posts.map((p) => (
                <label key={p.id} className="block">
                  <span className="mb-1 block truncate text-[12.5px] text-spark-ink-muted">{p.title}</span>
                  <input
                    type="url"
                    inputMode="url"
                    value={urls[p.id] ?? ""}
                    placeholder="Paste the web address"
                    onChange={(e) => setUrls((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onBlur={() => void saveUrl(p.id)}
                    className="w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]"
                  />
                  {!/^https?:\/\/\S+\.\S+/i.test((urls[p.id] ?? "").trim()) && (
                    <span className="mt-1 block text-[11.5px] text-[#A3660F]">No Read more button until this has a link</span>
                  )}
                </label>
              ))}
            </div>
            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => write()}
                disabled={writing}
                className="flex items-center gap-1.5 rounded-[10px] border border-spark-rule bg-white px-3.5 py-2 text-[13px] font-semibold text-spark-ink hover:border-[#d9c6a8] disabled:opacity-50"
              >
                {writing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Write again
              </button>
            </div>
          </div>

          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <p className={eyebrow}>Preview</p>
            {built && <EmailResult subject={subject} html={built.html} text={built.text} />}
            {/* To up to ten people through BoldTrail (2026-10-15). Every post
                needs its link first, so no Read more goes nowhere. */}
            {built && newsletter && (
              <BoldTrailSend
                subject={subject}
                blockedReason={posts.some((p) => !/^https?:\/\/\S+\.\S+/i.test((urls[p.id] ?? "").trim())) ? "Paste every post's web address first, so each Read more has somewhere to go." : null}
                onSend={(contacts) => postBoldTrailEmail({ kind: "newsletter", projectIds: ids, newsletter, urls, subjectIdx, contacts })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
