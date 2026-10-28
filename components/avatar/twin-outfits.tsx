"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shirt, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAccount } from "@/lib/hooks/use-account";
import { LockedFeature } from "@/components/access/locked-feature";

/**
 * Outfits for the Digital Twin (2026-10-28, the owner's ask).
 *
 * "Describe an outfit" makes an AI look from the twin itself. HeyGen animates
 * it with the twin's own motion, so it moves like the twin in a new outfit.
 * Each outfit shows up as a look in video setup and counts as the twin there.
 * Billed like a photo look: the first look each month is free, then each one
 * uses one short video (app/api/avatar/generate-look).
 */
interface Look { id: string; name: string; preview_image_url: string | null; status: string | null }

export function TwinOutfits() {
  // Paid plans only (2026-10-28, the owner's call); nothing until the plan is known.
  const account = useAccount();
  if (!account) return null;
  if (!account.paid) {
    return (
      <LockedFeature
        compact
        feature="Outfits for your twin"
        body="Dress your Digital Twin in new outfits with a SparkReels plan."
      />
    );
  }
  return <TwinOutfitsPaid />;
}

function TwinOutfitsPaid() {
  const [outfits, setOutfits] = useState<Look[]>([]);
  const [prompt, setPrompt] = useState("");
  const [making, setMaking] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/avatar/looks").catch(() => null);
    const data = res?.ok ? await res.json() : null;
    if (!data) return;
    const ids: string[] = Array.isArray(data.twinLookIds) ? data.twinLookIds : [];
    const twin: string | null = typeof data.twinLookId === "string" ? data.twinLookId : null;
    const looks: Look[] = Array.isArray(data.looks) ? data.looks : [];
    setOutfits(looks.filter((l) => l.id !== twin && ids.includes(l.id)));
  }, []);

  useEffect(() => { void load(); }, [load]);

  // A new outfit takes a minute or two; check back while one is being made.
  const pending = outfits.some((o) => o.status && o.status !== "completed" && o.status !== "active");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [pending, load]);

  async function make() {
    const text = prompt.trim();
    if (text.length < 10) { toast.error("Describe the outfit in a few more words."); return; }
    setMaking(true);
    try {
      const res = await fetch("/api/avatar/generate-look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twin: true, prompt: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || "Couldn't make that outfit. Try again."); return; }
      toast.success(data.freeUsed ? "Making your outfit (this month's free look)." : "Making your outfit.");
      setPrompt("");
      await load();
    } finally {
      setMaking(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this outfit? It's deleted for good.")) return;
    setRemoving(id);
    try {
      const res = await fetch("/api/avatar/looks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookId: id }),
      });
      if (!res.ok) { toast.error("Couldn't remove it. Try again."); return; }
      setOutfits((o) => o.filter((x) => x.id !== id));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[15px] font-semibold text-spark-ink">
        <Shirt size={15} className="text-[#A3660F]" /> Outfits
      </p>
      <p className="mt-0.5 text-[13.5px] text-spark-ink-muted">
        Your twin in a different outfit. It moves like your twin and shows up as a look in video setup.
      </p>

      {outfits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {outfits.map((o) => {
            const ready = !o.status || o.status === "completed" || o.status === "active";
            return (
              <div key={o.id} className="relative w-[96px]">
                <div className="flex h-[128px] w-[96px] items-center justify-center overflow-hidden rounded-lg border border-spark-rule bg-spark-amber-tint">
                  {ready && o.preview_image_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={o.preview_image_url} alt={o.name} className="h-full w-full object-cover" />
                    : <Loader2 size={18} className="animate-spin text-[#A3660F]" />}
                </div>
                <p className="mt-1 truncate text-[12px] text-spark-ink-muted" title={o.name}>{ready ? o.name : "Being made…"}</p>
                <button
                  type="button"
                  onClick={() => void remove(o.id)}
                  disabled={removing === o.id}
                  aria-label="Remove outfit"
                  className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-red-500 hover:text-red-700"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !making) void make(); }}
          placeholder="Describe the outfit, e.g. navy blazer over a white shirt"
          className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-[14.5px] text-spark-ink outline-none focus:border-spark-amber"
        />
        <button
          type="button"
          onClick={() => void make()}
          disabled={making}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[14.5px] font-semibold text-white spark-cta-gradient disabled:opacity-60"
        >
          {making && <Loader2 size={14} className="animate-spin" />} New outfit
        </button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-spark-ink-faint">
        Your first new look each month is free; after that each one uses one short video.
      </p>
    </div>
  );
}
