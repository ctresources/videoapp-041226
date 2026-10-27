"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Google reviews, and replying to them.
 *
 * A reply under a review is read by everyone who reads the review, and most
 * agents never write one because it means opening a different app and facing
 * an empty box. This lists the reviews, drafts a reply to edit, and posts it.
 *
 * Drafting posts nothing. The reply goes to Google only from "Post reply".
 */
interface Review {
  name: string;
  reviewer: string;
  stars: number;
  text: string;
  createdAt: string;
  reply: { text: string; updatedAt: string } | null;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${n} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} className={i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
      ))}
    </span>
  );
}

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function GoogleReviewsTool({ onTrialLock, onAskForReviews }: { onTrialLock?: (data: unknown) => boolean; /** Opens Ask for Google Review Video Email (2026-10-27). */ onAskForReviews?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [average, setAverage] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Answered reviews are tucked away until asked for. */
  const [onlyUnanswered, setOnlyUnanswered] = useState(true);
  /** The review being replied to, and the words so far. */
  const [editing, setEditing] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load(pageToken?: string) {
    if (pageToken) setLoadingMore(true); else setLoading(true);
    try {
      const res = await fetch(`/api/tools/google-reviews${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`);
      const data = await res.json().catch(() => ({}));
      if (data.connected === false) { setConnected(false); return; }
      if (!res.ok || data.error) { setError(data.error || "Your reviews couldn't be loaded."); return; }
      setError(null);
      setReviews((prev) => (pageToken ? [...prev, ...(data.reviews ?? [])] : data.reviews ?? []));
      if (typeof data.averageRating === "number") setAverage(data.averageRating);
      if (typeof data.total === "number") setTotal(data.total);
      setNextPage(data.nextPageToken ?? null);
    } catch {
      setError("Your reviews couldn't be loaded.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/tools/google-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (onTrialLock?.(data)) return null;
      throw new Error(data.error || "That didn't work. Try again.");
    }
    return data;
  }

  async function draft(r: Review) {
    setBusy(`draft:${r.name}`);
    try {
      const data = await post({ action: "draft", reviewer: r.reviewer, stars: r.stars, review: r.text });
      if (data?.text) setEditing({ name: r.name, text: data.text });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "A reply couldn't be drafted.");
    } finally {
      setBusy(null);
    }
  }

  async function send(r: Review) {
    if (!editing || editing.name !== r.name) return;
    setBusy(`send:${r.name}`);
    try {
      const data = await post({ action: "reply", reviewName: r.name, text: editing.text });
      if (!data) return;
      setReviews((prev) => prev.map((x) => (x.name === r.name ? { ...x, reply: data.reply } : x)));
      setEditing(null);
      toast.success("Reply posted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reply couldn't be posted.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: Review) {
    if (!window.confirm("Remove your reply from Google?")) return;
    setBusy(`remove:${r.name}`);
    try {
      const data = await post({ action: "remove", reviewName: r.name });
      if (!data) return;
      setReviews((prev) => prev.map((x) => (x.name === r.name ? { ...x, reply: null } : x)));
      toast.success("Reply removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reply couldn't be removed.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={15} className="animate-spin" /> Loading your reviews…
      </div>
    );
  }
  if (!connected) {
    return (
      <p className="text-sm text-slate-600">
        Connect Google Business to see your reviews here.{" "}
        <Link href="/settings/social" className="font-semibold text-primary-600 hover:underline">Open Settings</Link>
      </p>
    );
  }
  if (error && reviews.length === 0) {
    return (
      <div>
        <p className="text-sm text-slate-600">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => load()}>Try again</Button>
      </div>
    );
  }

  const shown = onlyUnanswered ? reviews.filter((r) => !r.reply || editing?.name === r.name) : reviews;
  const waiting = reviews.filter((r) => !r.reply).length;

  return (
    <div>
      {onAskForReviews && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={onAskForReviews}>Ask for more reviews</Button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {average !== null && (
          <p className="flex items-center gap-1.5 text-lg font-bold text-brand-text">
            <Star size={18} className="fill-amber-400 text-amber-400" />
            {average.toFixed(1)}
            {total !== null && (
              <span className="text-sm font-normal text-slate-500">
                · {total} review{total === 1 ? "" : "s"}
              </span>
            )}
          </p>
        )}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={onlyUnanswered}
            onChange={(e) => setOnlyUnanswered(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-primary-500"
          />
          Needs a reply{waiting > 0 ? ` (${waiting})` : ""}
        </label>
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-slate-500">
          {reviews.length === 0 ? "No reviews yet." : "All caught up."}
        </p>
      )}

      <ul className="space-y-3">
        {shown.map((r) => {
          const open = editing?.name === r.name;
          return (
            <li key={r.name} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <Stars n={r.stars} />
                <span className="text-sm font-semibold text-brand-text">{r.reviewer || "A Google user"}</span>
                <span className="text-xs text-slate-400">{day(r.createdAt)}</span>
              </div>
              {r.text && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{r.text}</p>}

              {r.reply && !open && (
                <div className="mt-3 rounded-lg border-l-2 border-primary-300 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-500">Your reply</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{r.reply.text}</p>
                  <div className="mt-2 flex items-center gap-4">
                    <button type="button" onClick={() => setEditing({ name: r.name, text: r.reply!.text })}
                      className="text-xs font-semibold text-primary-600 hover:underline">Edit</button>
                    <button type="button" onClick={() => remove(r)} disabled={busy !== null}
                      className="text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50">
                      {busy === `remove:${r.name}` ? "Removing…" : "Remove"}
                    </button>
                  </div>
                </div>
              )}

              {!r.reply && !open && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={() => draft(r)} loading={busy === `draft:${r.name}`} disabled={busy !== null} className="gap-1.5">
                    <Sparkles size={13} /> Draft a reply
                  </Button>
                  <button type="button" onClick={() => setEditing({ name: r.name, text: "" })}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700">
                    Write my own
                  </button>
                </div>
              )}

              {open && (
                <div className="mt-3">
                  <textarea
                    value={editing!.text}
                    onChange={(e) => setEditing({ name: r.name, text: e.target.value })}
                    rows={4}
                    maxLength={4000}
                    aria-label="Your reply"
                    className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Button size="sm" onClick={() => send(r)} loading={busy === `send:${r.name}`} disabled={busy !== null || !editing!.text.trim()}>
                      Post reply
                    </Button>
                    <button type="button" onClick={() => draft(r)} disabled={busy !== null}
                      className="text-xs font-semibold text-primary-600 hover:underline disabled:opacity-50">
                      {busy === `draft:${r.name}` ? "Drafting…" : "Draft again"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {nextPage && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => load(nextPage)} loading={loadingMore}>
          Load more
        </Button>
      )}
    </div>
  );
}
