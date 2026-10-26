"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useHalo } from "@/components/halo/use-halo";
import { SparkleeDrafts } from "@/components/halo/halo-drafts";

const PLATFORM_NAMES: Record<string, string> = {
  youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", google_business: "Google Business",
  linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads",
};

function whenText(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * Tell Sparklee, she does it (2026-10-26, usability sweep #11).
 *
 * Under the topic box on Create. "Sparklee, make it" sends the words: she
 * asks only for what's missing, otherwise writes the script, blog, title and
 * thumbnail, makes the video, and brings it back as a card to watch and
 * approve. Nothing posts until it's approved. On a free plan, or for a blog
 * or a camera take, the page below is filled in instead.
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
  const [said, setSaid] = useState<{ me: string; her: string } | null>(preview ?? null);

  async function go() {
    const text = words.trim();
    if (!text || busy) return;
    setBusy(true);
    setSaid({ me: text, her: "…" });
    try {
      const b = await fetch("/api/ai/brief-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: [{ role: "user", content: text }], mode: "script" }),
      }).then((r) => r.json()).catch(() => ({}));
      const r = await fetch("/api/sparklee/make", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: text, slots: (b as { slots?: unknown }).slots ?? {} }),
      });
      const out = (await r.json().catch(() => ({}))) as {
        ask?: string; fill?: boolean; reason?: string; error?: string;
        draftId?: string; slotAt?: string; platforms?: string[];
      };
      if (out.ask) {
        setSaid({ me: text, her: `${out.ask} Add it in the box above, then press Sparklee, make it again.` });
      } else if (out.fill) {
        setSaid({
          me: text,
          her: out.reason === "plan"
            ? "I filled it in for you below. Press Next when you're ready. (I make and post videos by myself on the paid plans.)"
            : "I filled it in for you below. Press Next when you're ready.",
        });
      } else if (out.draftId) {
        const where = (out.platforms ?? []).map((p) => PLATFORM_NAMES[p] ?? p).join(", ");
        setSaid({
          me: text,
          her: `On it. I'm writing the script and making the video now. It takes about 10–12 minutes, and I'll let you know. Watch it, then approve it to post${where ? ` to ${where}` : ""}${out.slotAt ? ` on ${whenText(out.slotAt)}` : ""}.`,
        });
        await halo.reloadDrafts();
      } else {
        setSaid({ me: text, her: out.error ?? "Something went wrong. Try again." });
      }
    } catch {
      setSaid({ me: text, her: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => void go()}
        disabled={disabled || busy || !words.trim()}
        className="flex items-center justify-center gap-2 self-center rounded-full bg-spark-amber px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <Sparkles size={16} /> {busy ? "Sparklee is on it…" : "Sparklee, make it"}
      </button>

      {said && (
        <div className="flex flex-col gap-1.5">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-spark-amber-tint px-3.5 py-2 text-[14px] text-spark-ink">{said.me}</p>
          <div className="flex max-w-[92%] items-start gap-2">
            <span className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-spark-amber-tint">
              <Image src="/sparklee.webp" alt="" width={28} height={28} className="h-full w-full" unoptimized />
            </span>
            <p className="rounded-2xl rounded-bl-md border border-spark-rule bg-white px-3.5 py-2 text-[14px] text-spark-ink">{said.her}</p>
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
