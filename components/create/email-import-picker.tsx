"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy, Loader2, Mail, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

export interface EmailImportItem {
  id: string;
  subject: string;
  from: string | null;
  words: number;
  receivedAt: string;
  preview: string;
}

export interface PickedEmailArticle {
  id: string;
  subject: string;
  text: string;
  words: number;
  imageUrls: string[];
}

/**
 * Pick an article the agent forwarded to their private import address.
 *
 * The address comes first and stays visible even once there are imports to
 * choose from: the list is empty until something has been forwarded, and an
 * empty list with no address on it is a dead end. Nothing here is real-time —
 * mail arrives while the page is open, so there is a Check button rather than a
 * promise that the list is current.
 */
export function EmailImportPicker({
  onPick,
  picking,
}: {
  onPick: (article: PickedEmailArticle) => void;
  /** Set while the caller is doing something with the article that was picked. */
  picking?: boolean;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [items, setItems] = useState<EmailImportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { announce?: boolean }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/imports");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Couldn't load your forwarded emails");
      const next = (body.items ?? []) as EmailImportItem[];
      if (opts?.announce) {
        const added = next.length - items.length;
        toast.success(
          added > 0
            ? `${added} new email${added === 1 ? "" : "s"} found.`
            : "Nothing new yet — forwards usually arrive within a minute.",
        );
      }
      setAddress(body.address ?? null);
      setItems(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load your forwarded emails");
    } finally {
      setLoading(false);
    }
  }, [items.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some in-app browsers; the address is on screen
      // to be read either way.
      toast.error("Couldn't copy — select the address and copy it by hand.");
    }
  }

  async function pick(id: string) {
    setFetchingId(id);
    try {
      const res = await fetch(`/api/email/imports?id=${encodeURIComponent(id)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Couldn't open that email");
      onPick({
        id,
        subject: (body.subject as string) || "(no subject)",
        text: (body.text as string) || "",
        words: Number(body.words ?? 0),
        imageUrls: Array.isArray(body.imageUrls) ? (body.imageUrls as string[]) : [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that email");
    } finally {
      setFetchingId(null);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const res = await fetch(`/api/email/imports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't remove that one.");
      load();
    }
  }

  return (
    <div>
      {/* The address. Shown as text rather than only behind a Copy button,
          because it also gets added to a phone's contacts by hand. */}
      <div className="flex items-center gap-2 p-2.5 rounded-xl border border-spark-rule bg-spark-paper">
        <Mail size={15} className="text-spark-amber shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-spark-ink-faint">
            Forward articles to
          </p>
          <p className="text-[12.5px] font-medium text-brand-text break-all select-all">
            {address ?? (loading ? "Getting your address…" : "Unavailable — reload the page")}
          </p>
        </div>
        <button
          type="button"
          onClick={copyAddress}
          disabled={!address}
          aria-label="Copy your import address"
          className="shrink-0 p-1.5 rounded-lg hover:bg-white disabled:opacity-40 transition-colors"
        >
          {copied
            ? <Check size={14} className="text-emerald-600" />
            : <Copy size={14} className="text-spark-ink-muted" />}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm font-bold text-spark-ink-soft">
          Forwarded {items.length > 0 && (
            <span className="font-normal text-spark-ink-faint">· newest first</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => load({ announce: true })}
          disabled={loading}
          className="flex items-center gap-1 text-[11px] font-semibold text-spark-ink-muted hover:text-brand-text disabled:opacity-50"
        >
          {loading
            ? <Loader2 size={11} className="animate-spin" />
            : <RefreshCw size={11} />}
          Check for new
        </button>
      </div>

      {items.length === 0 ? (
        <div className="mt-1.5 rounded-xl border-2 border-dashed border-spark-rule px-3 py-4 text-center">
          <p className="text-sm font-semibold text-spark-ink-soft">Nothing forwarded yet</p>
          <p className="mt-0.5 text-[11px] leading-[1.5] text-spark-ink-faint">
            Forward any email to the address above — a newsletter, a market report, an
            article someone sent you. It shows up here within a minute, with the
            signatures and footers already stripped out.
          </p>
        </div>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-xl border border-spark-rule bg-white p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-bold text-brand-text">{item.subject}</p>
                <p className="text-[10.5px] text-spark-ink-faint">
                  {item.words.toLocaleString()} words · {whenShort(item.receivedAt)}
                  {item.from ? ` · from ${senderName(item.from)}` : ""}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-[1.45] text-spark-ink-muted">
                  {item.preview}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  loading={fetchingId === item.id || (!!picking && fetchingId === item.id)}
                  disabled={!!fetchingId}
                  onClick={() => pick(item.id)}
                  className="whitespace-nowrap"
                >
                  Use this
                </Button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.subject}`}
                  className="p-1 rounded hover:bg-spark-paper"
                >
                  <Trash2 size={12} className="text-spark-ink-faint" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-spark-ink-faint">
        Anything forwarded is kept for 30 days, then removed on its own.
      </p>
    </div>
  );
}

/** "14 min ago" / "Tue" — a list of ten does not need a full timestamp. */
function whenShort(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The display name if the header carried one, otherwise the address. */
function senderName(from: string): string {
  const named = /^\s*"?([^"<]+?)"?\s*</.exec(from);
  return (named ? named[1] : from).trim();
}
