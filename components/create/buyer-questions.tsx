"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

/**
 * What buyers in this market are asking AI, as topics to tap.
 *
 * The question half of AI Answer Blocks, brought to where a topic is chosen
 * (2026-10-14, at the owner's ask). It was the tenth of eleven tabs in Spark
 * Tools, behind the title and thumbnail generators, and what it answers is
 * "what should this video be about", which is asked here.
 *
 * A tap puts the question itself in the topic box, so the video answers what
 * buyers type into an assistant. The text-for-your-website half stays in
 * Spark Tools; every blog article already ends with six of those for its own
 * topic.
 *
 * Asked only on a press: it is a research pass, not something to run on
 * every visit. A market already asked about comes back from this tab's
 * storage without asking again.
 */
interface Asked {
  question: string;
}

export function BuyerQuestions({
  city,
  state,
  agentName,
  onPick,
  className = "",
}: {
  city: string;
  state: string;
  agentName: string;
  onPick: (topic: string) => void;
  /** Its frame, which belongs to where it sits: a strip joined to the topic box. */
  className?: string;
}) {
  const [items, setItems] = useState<Asked[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState(false);
  const place = city.trim();
  const market = [place, state.trim().toUpperCase()].filter(Boolean).join(", ");
  const key = `buyer-questions:${market.toLowerCase()}`;

  useEffect(() => {
    setItems(null);
    setPicked(false);
    if (!market) return;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) setItems(JSON.parse(saved) as Asked[]);
    } catch { /* asked again on the press */ }
  }, [key, market]);

  async function ask() {
    if (!place) {
      toast("Set your city in step 4 first.");
      return;
    }
    setLoading(true);
    setPicked(false);
    try {
      const res = await fetch("/api/tools/answer-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName: agentName.trim() || "the agent", city: place, state: state.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't look that up. Try again.");
      const list: Asked[] = (Array.isArray(data.blocks) ? data.blocks : [])
        .filter((b: { question?: unknown }) => typeof b?.question === "string" && b.question.trim())
        .map((b: { question: string }) => ({ question: b.question.trim() }));
      if (list.length === 0) throw new Error("Nothing came back. Try again.");
      setItems(list);
      try { sessionStorage.setItem(key, JSON.stringify(list)); } catch { /* fine */ }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't look that up. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // A size down from its first version, which the owner found too big
    // (2026-10-14): one line, the heading's size, no tile round the icon.
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Bot size={16} className="flex-none text-[#A3660F]" aria-hidden />
          <p className="text-[15px] font-semibold leading-tight text-spark-ink">
            What buyers ask AI{place ? ` in ${place}` : ""}
          </p>
        </div>
        {items === null ? (
          <button
            type="button"
            onClick={ask}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg spark-cta-gradient px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Looking…" : "Show me"}
          </button>
        ) : (
          <button
            type="button"
            onClick={ask}
            disabled={loading}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-spark-ink-muted hover:text-spark-amber disabled:opacity-60"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Ask again
          </button>
        )}
      </div>

      {items && !picked && (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {items.map((it) => (
            <li key={it.question}>
              <button
                type="button"
                onClick={() => {
                  setPicked(true);
                  onPick(it.question);
                }}
                className="w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-left text-[14px] font-medium leading-[1.35] text-spark-ink transition-colors hover:border-spark-amber"
              >
                &ldquo;{it.question}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      )}
      {picked && (
        <p className="mt-2 text-[13px] text-spark-ink-muted">
          In the topic box.{" "}
          <button type="button" onClick={() => setPicked(false)} className="font-semibold text-spark-amber hover:underline">
            Show the others
          </button>
        </p>
      )}
    </section>
  );
}
