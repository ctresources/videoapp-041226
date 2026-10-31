"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useHalo } from "@/components/halo/use-halo";
import { SparkleeDrafts } from "@/components/halo/halo-drafts";

const PLATFORM_NAMES: Record<string, string> = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", google_business: "Google Business",
  linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads",
};

function whenText(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

interface Confirm {
  items: { label: string; value: string }[];
  usage: string | null;
  outOfVideos: boolean;
  platforms: string[];
  slotAt: string;
}

/**
 * Tell Sparklee, she does it (2026-10-26, usability sweep #11).
 *
 * Under the topic box on Spark Studio. "Sparklee, make it" sends the words:
 * she asks only for what's missing, otherwise shows "I'll create:" with what
 * she'd make (2026-10-31, the owner's ask) and waits for Create it. Then she
 * writes the script, blog, title and thumbnail, makes the video, and brings
 * it back as a card to watch and approve. Nothing posts until it's approved.
 * On a free plan, or for a blog or a camera take, the page below is filled in
 * instead. Same look as Ask Sparklee on Home: "You asked" and a gold card.
 */
export function SparkleeAgent({ words, userId, disabled = false, preview }: {
  /** A conversation to show as is (screenshots). */
  preview?: { me: string; her: string };
  /** What is in the topic box now. */
  words: string;
  userId: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const halo = useHalo(userId ?? undefined);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ me: string; her: string; hint?: string } | null>(preview ?? null);
  /** Waiting on Create it: the words and what was read from them, sent again as they were. */
  const [confirm, setConfirm] = useState<{ me: string; slots: unknown; c: Confirm } | null>(null);

  async function make(text: string, slots: unknown, previewOnly: boolean) {
    const r = await fetch("/api/sparklee/make", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: text, slots, preview: previewOnly }),
    });
    return (await r.json().catch(() => ({}))) as {
      ask?: string; fill?: boolean; reason?: string; error?: string; confirm?: Confirm;
      draftId?: string; slotAt?: string; platforms?: string[];
    };
  }

  async function go() {
    const text = words.trim();
    if (!text || busy) return;
    setBusy(true);
    setConfirm(null);
    setSaid({ me: text, her: "" });
    try {
      const b = await fetch("/api/ai/brief-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: [{ role: "user", content: text }], mode: "script" }),
      }).then((r) => r.json()).catch(() => ({}));
      const slots = (b as { slots?: unknown }).slots ?? {};
      const out = await make(text, slots, true);
      if (out.ask) {
        setSaid({ me: text, her: `“${out.ask}”`, hint: "Add it in the box above, or say it out loud, then press Sparklee, make it again." });
      } else if (out.fill) {
        setSaid({
          me: text,
          her: out.reason === "plan"
            ? "I filled it in for you below. Press Next when you're ready. (I make and post videos by myself on the paid plans.)"
            : "I filled it in for you below. Press Next when you're ready.",
        });
      } else if (out.confirm) {
        setSaid(null);
        setConfirm({ me: text, slots, c: out.confirm });
      } else {
        setSaid({ me: text, her: out.error ?? "Something went wrong. Try again." });
      }
    } catch {
      setSaid({ me: text, her: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function createIt() {
    if (!confirm || busy) return;
    const { me, slots } = confirm;
    setBusy(true);
    try {
      const out = await make(me, slots, false);
      setConfirm(null);
      if (out.draftId) {
        const where = (out.platforms ?? []).map((p) => PLATFORM_NAMES[p] ?? p).join(", ");
        setSaid({
          me,
          her: `On it. I'm writing the script and making the video now. It takes about 10–12 minutes, and I'll let you know. Watch it, then approve it to post${where ? ` to ${where}` : ""}${out.slotAt ? ` on ${whenText(out.slotAt)}` : ""}.`,
        });
        await halo.reloadDrafts();
      } else if (out.ask) {
        setSaid({ me, her: `“${out.ask}”`, hint: "Add it in the box above, or say it out loud, then press Sparklee, make it again." });
      } else {
        setSaid({ me, her: out.error ?? "Something went wrong. Try again." });
      }
    } catch {
      setSaid({ me, her: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function changeDetails() {
    if (!confirm) return;
    setSaid({ me: confirm.me, her: "Change anything below, then press Next." });
    setConfirm(null);
    setTimeout(() => document.getElementById("video-kind")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }

  const me = confirm?.me ?? said?.me;
  const where = confirm ? confirm.c.platforms.map((p) => PLATFORM_NAMES[p] ?? p).join(", ") : "";

  return (
    <div className="flex flex-col gap-2.5">
      {!confirm && (
        <button
          type="button"
          onClick={() => void go()}
          disabled={disabled || busy || !words.trim()}
          className="flex items-center justify-center gap-2 self-center rounded-full bg-spark-amber px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={16} /> {busy ? "Sparklee is on it…" : "Sparklee, make it"}
        </button>
      )}

      {me && (
        <div className="flex flex-col gap-1.5">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-[#2a2219] px-3.5 py-2.5 text-[15px] text-white">
            <span className="block text-[11px] font-extrabold uppercase tracking-wide text-[#cdbf9f]">You asked</span>
            &ldquo;{me}&rdquo;
          </div>
          <div className="flex items-start gap-2.5">
            <span className="sparklee-badge block h-[32px] w-[32px] shrink-0">
              <Image src="/sparklee.webp" alt="" width={32} height={32} className="h-full w-full" unoptimized />
            </span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-[#f0dcb4] bg-[#fbf3e4] px-3.5 py-3">
              <p className="text-[13px] font-extrabold text-[#A3660F]">Sparklee</p>
              {confirm ? (
                <>
                  <p className="mt-0.5 text-[15.5px] text-spark-ink">I&apos;ll create:</p>
                  <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {confirm.c.items.map((it) => (
                      <li key={it.label} className="rounded-xl border border-spark-rule bg-white px-2.5 py-1.5 text-[14.5px] text-spark-ink">
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-spark-ink-muted">{it.label}</span>
                        {it.value}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[13px] text-spark-ink-muted">
                    {confirm.c.usage && <>{confirm.c.usage} </>}
                    Posts{where ? ` to ${where}` : ""} on {whenText(confirm.c.slotAt)}, only after you approve it.
                  </p>
                  {confirm.c.outOfVideos && (
                    <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[13px] text-red-700">You&apos;re out of videos this month. Buy more in Billing, or press Change details.</p>
                  )}
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void createIt()} disabled={busy || confirm.c.outOfVideos}
                      className="flex items-center gap-1.5 rounded-xl bg-spark-amber px-4 py-2 text-[14.5px] font-bold text-white disabled:opacity-50">
                      {busy && <Loader2 size={14} className="animate-spin" />} Create it
                    </button>
                    <button type="button" onClick={changeDetails} disabled={busy}
                      className="rounded-xl border border-spark-rule bg-white px-4 py-2 text-[14.5px] font-semibold text-spark-ink hover:border-spark-amber">
                      Change details
                    </button>
                  </div>
                </>
              ) : said?.her ? (
                <>
                  <p className="mt-0.5 text-[15px] text-spark-ink">{said.her}</p>
                  {said.hint && <p className="mt-1 text-[12px] text-[#a29d92]">{said.hint}</p>}
                </>
              ) : (
                <p className="mt-0.5 flex items-center gap-2 text-[15px] text-spark-ink"><Loader2 size={15} className="animate-spin text-spark-amber" /> Reading your request…</p>
              )}
            </div>
          </div>
        </div>
      )}

      <SparkleeDrafts
        halo={halo}
        needsVideo={new Set()}
        onOutOfVideos={() => router.push("/billing")}
        onlyOpen
        limit={2}
      />
    </div>
  );
}
