"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2, Mail, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchEmailArticle,
  whenShort,
  type EmailImportItem,
  type PickedEmailArticle,
} from "@/components/create/email-import-picker";

/**
 * When the list was last opened in this browser. Anything that arrived after
 * it is "new". A convenience only, so it lives in the browser: a phone and a
 * computer each count their own.
 */
const SEEN_KEY = "spark_emails_seen_at";
/** With nothing recorded, an email counts as new for this long. */
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

function readSeen(): number {
  try {
    const t = Date.parse(localStorage.getItem(SEEN_KEY) ?? "");
    if (Number.isFinite(t)) return t;
  } catch { /* private mode */ }
  return Date.now() - FRESH_MS;
}

/**
 * What you have emailed in, at the top of the Create page.
 *
 * A forwarded email could only be reached from inside a route: pick blog or
 * video, pick a source, open "Start from something you already have", choose
 * From email. Five taps to find out whether the report you sent had arrived,
 * and nothing on the page said it had.
 *
 * Closed, this is one line that says how many are waiting and how many are
 * new. Open, each one has the two things you would do with it. Picking one
 * sets the route up with the email already attached; it writes nothing by
 * itself, so nothing here can spend a video.
 *
 * Renders nothing until something has been forwarded. The address and how to
 * use it are in Settings and in the From email picker, and an empty box at the
 * top of the page for a feature someone has not used would only be in the way.
 */
export function ForwardedEmails({
  onMake,
  busy = false,
}: {
  /** Start a blog or a video from this email. */
  onMake: (article: PickedEmailArticle, kind: "blog" | "video") => void;
  /** The page is already writing something. */
  busy?: boolean;
}) {
  const [items, setItems] = useState<EmailImportItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seen, setSeen] = useState<number>(() => Date.now());
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async (announce = false) => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/imports?address=0");
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Couldn't load your forwarded emails");
      const next = (body.items ?? []) as EmailImportItem[];
      setItems((prev) => {
        if (announce) {
          const added = next.filter((n) => !prev.some((p) => p.id === n.id)).length;
          toast.success(added > 0
            ? `${added} new email${added === 1 ? "" : "s"} found.`
            : "Nothing new yet. Forwards usually arrive within a minute.");
        }
        return next;
      });
    } catch (err) {
      // Quiet on arrival: this loads by itself, and a page that opens with an
      // error about something nobody asked for is worse than a missing line.
      if (announce) toast.error(err instanceof Error ? err.message : "Couldn't load your forwarded emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSeen(readSeen());
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const fresh = items.filter((i) => Date.parse(i.receivedAt) > seen).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the list is reading it. The "new" count stays on screen for
    // this visit, so the rows can still be told apart, and is gone next time.
    if (next) {
      try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* private mode */ }
    }
  }

  async function make(id: string, kind: "blog" | "video") {
    if (opening || busy) return;
    setOpening(`${id}:${kind}`);
    try {
      onMake(await fetchEmailArticle(id), kind);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that email");
    } finally {
      setOpening(null);
    }
  }

  const action = "rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-50";

  return (
    <section className="mt-2.5 w-full text-left">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
          fresh > 0
            ? "border-spark-amber bg-spark-amber-tint"
            : "border-spark-rule bg-white hover:border-spark-rule-dim"
        }`}
      >
        <Mail size={17} className="shrink-0 text-spark-amber" />
        <span className="min-w-0 flex-1 text-[15px] leading-snug text-spark-ink">
          {/* One wording for both states, the owner's: what this is, how
              many, and what you can do with one. The line used to drop the
              "make a blog or a video" half exactly when there was something
              new, which is when someone is most likely to act on it. */}
          <strong className="font-bold">Imported content:</strong>{" "}
          {fresh > 0 ? (
            <>
              {fresh} new email{fresh === 1 ? "" : "s"}
              {items.length > fresh && <> · {items.length} total</>}
            </>
          ) : (
            <>{items.length} email{items.length === 1 ? "" : "s"}</>
          )}
          <span className="text-spark-ink-muted"> · make a blog or video</span>
        </span>
        <ChevronDown
          size={17}
          className={`shrink-0 text-spark-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-spark-rule bg-white p-2.5">
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const isNew = Date.parse(item.receivedAt) > seen;
              return (
                <li key={item.id} className="rounded-lg border border-spark-rule-soft p-2.5">
                  <p className="flex items-start gap-1.5 text-[14px] font-bold leading-snug text-brand-text">
                    <span className="min-w-0 flex-1 break-words">{item.subject}</span>
                    {isNew && (
                      <span className="shrink-0 rounded-full bg-spark-amber px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white">
                        New
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-spark-ink-faint">
                    {item.pdfSource && (
                      <span className="flex items-center gap-1 font-semibold text-spark-amber">
                        <FileText size={11} /> PDF read
                      </span>
                    )}
                    <span>{item.words.toLocaleString()} words · {whenShort(item.receivedAt)}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["blog", "video"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => make(item.id, kind)}
                        disabled={!!opening || busy}
                        className={`${action} ${
                          kind === "blog"
                            ? "border-spark-amber bg-spark-amber text-white hover:opacity-90"
                            : "border-spark-rule bg-white text-spark-ink hover:border-spark-amber"
                        }`}
                      >
                        {opening === `${item.id}:${kind}`
                          ? <Loader2 size={13} className="inline animate-spin" />
                          : kind === "blog" ? "Make a blog" : "Make a video"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
            <p className="text-[12px] leading-snug text-spark-ink-faint">
              Kept for 30 days. You can also say &ldquo;create a blog from my &hellip; email&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => load(true)}
              disabled={loading}
              className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-spark-ink-muted hover:text-brand-text disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Check for new
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
