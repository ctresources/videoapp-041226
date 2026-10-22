"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Globe, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";

interface Status { slug: string; title: string; topic: string | null; author_name: string | null; published: boolean }

const slugOf = (t: string) =>
  t.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

/**
 * "Publish to SparkReels blog" (2026-10-22, the owner's approved mockup).
 * Admins only — the page decides whether to show it. Puts this article on
 * sparkreels.ai/blog, or updates or unpublishes it there.
 */
export function PublishToBlog({ projectId, headline, defaultAuthor }: { projectId: string; headline: string; defaultAuthor?: string | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(headline);
  const [slug, setSlug] = useState(slugOf(headline));
  const [topic, setTopic] = useState("");
  const [author, setAuthor] = useState(defaultAuthor ?? "");

  useEffect(() => {
    fetch(`/api/blog/publish?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.post as Status | null;
        if (!p) return;
        setStatus(p);
        setTitle(p.title);
        setSlug(p.slug);
        setTopic(p.topic ?? "");
        if (p.author_name) setAuthor(p.author_name);
      })
      .catch(() => {});
  }, [projectId]);

  async function publish() {
    setBusy(true);
    try {
      const res = await fetch("/api/blog/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, title, slug, topic, author }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Couldn't publish it.");
      setStatus({ slug: d.slug, title, topic: topic || null, author_name: author || null, published: true });
      setSlug(d.slug);
      setOpen(false);
      toast.success("Published to sparkreels.ai/blog.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish it.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!confirm("Take this post off sparkreels.ai/blog?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/blog/publish", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error();
      setStatus((s) => (s ? { ...s, published: false } : s));
      setOpen(false);
      toast.success("Unpublished.");
    } catch {
      toast.error("Couldn't unpublish it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const live = status?.published;
  const field = "w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-sm text-spark-ink focus:border-spark-amber focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-spark-amber bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
      >
        <Globe size={12} /> {live ? "On SparkReels blog" : "Publish to SparkReels blog"}
      </button>
      {live && (
        <a
          href={`/blog/${status!.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-[#A3660F] hover:underline"
        >
          View <ExternalLink size={11} />
        </a>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-bold text-spark-ink">{live ? "Update on sparkreels.ai/blog" : "Publish to sparkreels.ai/blog"}</p>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-spark-ink-muted hover:text-spark-ink">
                <X size={16} />
              </button>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-spark-ink">Title</span>
              <input
                className={field}
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (!status) setSlug(slugOf(e.target.value)); }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-spark-ink">Web address</span>
              <span className="flex items-center gap-1 text-sm text-spark-ink-muted">
                sparkreels.ai/blog/
                <input className={field} value={slug} onChange={(e) => setSlug(slugOf(e.target.value))} />
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-spark-ink">Topic</span>
                <input className={field} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="AI marketing" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-spark-ink">Author</span>
                <input className={field} value={author} onChange={(e) => setAuthor(e.target.value)} />
              </label>
            </div>
            <p className="text-[11.5px] text-spark-ink-faint">The header image, if the post has one, is the cover picture.</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || !title.trim() || !slug}
                onClick={() => void publish()}
                className="flex items-center gap-1.5 rounded-lg spark-cta-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {live ? "Update" : "Publish"}
              </button>
              {live && (
                <button type="button" disabled={busy} onClick={() => void unpublish()} className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                  Unpublish
                </button>
              )}
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-spark-ink-muted hover:text-spark-ink">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
