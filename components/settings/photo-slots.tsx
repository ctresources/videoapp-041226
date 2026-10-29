"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Plus, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { uploadImage } from "@/lib/utils/upload-image";
import { useAccount } from "@/lib/hooks/use-account";
import { UPGRADE_HREF } from "@/lib/access";
import { cn } from "@/lib/utils/cn";

/**
 * The agent's photos (2026-10-29, the owner's mockup): a vertical one for
 * Reels and Shorts and a horizontal one for YouTube. The 9:16 presenter is
 * made from the vertical photo and the 16:9 one from the horizontal photo; an
 * empty slot is filled from the other photo, as before.
 *
 * Paid plans: both slots. Free plan: one photo, in the shape they choose,
 * with the second slot locked (the server enforces it: /api/profile/photo).
 */
type Slot = "tall" | "wide";

export function PhotoSlots({
  initialTall, initialWide, onUpdate,
}: {
  initialTall: string | null;
  initialWide: string | null;
  /** The main photo (vertical if there is one) and the photo avatar id, for the rest of the form. */
  onUpdate: (avatarUrl: string, photoId: string | null) => void;
}) {
  const account = useAccount();
  const [photos, setPhotos] = useState<Record<Slot, string | null>>({ tall: initialTall, wide: initialWide });
  const [busy, setBusy] = useState<Slot | null>(null);
  const [removeBg, setRemoveBg] = useState(false);
  const [regError, setRegError] = useState<{ slot: Slot; url: string } | null>(null);
  // Free plan: which shape their one photo is.
  const [freeShape, setFreeShape] = useState<Slot>(initialTall || !initialWide ? "tall" : "wide");
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Slot>("tall");

  function pick(slot: Slot) {
    pending.current = slot;
    inputRef.current?.click();
  }

  async function save(slot: Slot, url: string) {
    const res = await fetch("/api/profile/photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, image_url: url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Couldn't save that photo.");
    setPhotos({ tall: data.photo_tall_url ?? null, wide: data.photo_wide_url ?? null });
    onUpdate(data.avatar_url ?? "", data.photo_id ?? null);
    if (data.registration_error) {
      setRegError({ slot, url });
      toast.error("Photo saved, but your avatar couldn't be updated. Use a clear front-facing photo, then Retry.");
    } else {
      setRegError(null);
      toast.success("Photo saved. Your videos will use it.");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const slot = pending.current;
    setBusy(slot);
    try {
      let url = await uploadImage(file, "headshot");
      if (removeBg) {
        const r = await fetch("/api/avatar/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: url }),
        }).catch(() => null);
        const d = r ? await r.json().catch(() => ({})) : {};
        if (r?.ok && d.url) url = d.url;
        else toast("Background removal unavailable — using the original photo.", { icon: "ℹ️" });
      }
      await save(slot, url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The upload didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(slot: Slot) {
    if (!confirm("Remove this photo?")) return;
    setBusy(slot);
    try {
      const res = await fetch("/api/profile/photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't remove it.");
      setPhotos({ tall: data.photo_tall_url ?? null, wide: data.photo_wide_url ?? null });
      onUpdate(data.avatar_url ?? "", null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove it.");
    } finally {
      setBusy(null);
    }
  }

  if (!account) return <div className="h-40" />;
  const paid = account.paid;

  const slotCard = (slot: Slot, opts: { title: string; tag?: string; chips?: boolean }) => {
    const url = photos[slot];
    const tall = slot === "tall";
    return (
      <div className="flex h-full flex-col gap-3 rounded-xl border border-spark-rule bg-white p-4">
        <div>
          <p className="text-[15px] font-semibold text-spark-ink">{opts.title}</p>
          {opts.tag && <p className="text-[13px] text-spark-ink-muted">{opts.tag}</p>}
        </div>
        {opts.chips && (
          <div className="flex gap-2">
            {(["tall", "wide"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFreeShape(s)}
                className={cn(
                  "rounded-full border px-3.5 py-1 text-[13.5px] font-semibold",
                  freeShape === s ? "border-spark-amber bg-spark-amber-tint text-[#A3660F]" : "border-spark-rule bg-white text-spark-ink",
                )}
              >
                {s === "tall" ? "Vertical" : "Horizontal"}
              </button>
            ))}
          </div>
        )}
        <div className="flex h-[190px] items-center justify-center rounded-lg bg-[#f4efe6]">
          <button
            type="button"
            onClick={() => !busy && pick(slot)}
            disabled={!!busy}
            className={cn(
              "relative overflow-hidden rounded-lg",
              tall ? "h-[190px] w-[107px]" : "h-[169px] w-full max-w-[300px]",
              url ? "" : "flex flex-col items-center justify-center gap-1 border-2 border-dashed border-[#d9cfbd] bg-[#fbf8f2] text-[13px] text-spark-ink-faint",
            )}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="h-full w-full object-cover" />
            ) : (
              <><Plus size={22} /> Add photo</>
            )}
            {busy === slot && (
              <span className="absolute inset-0 flex items-center justify-center bg-white/75">
                <Loader2 size={20} className="animate-spin text-[#A3660F]" />
              </span>
            )}
          </button>
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => pick(slot)}
            disabled={!!busy}
            className={cn(
              "rounded-xl px-4 py-2 text-[14px] font-semibold disabled:opacity-50",
              url ? "border border-spark-rule bg-white text-spark-ink" : "spark-cta-gradient text-white",
            )}
          >
            {busy === slot ? "Saving…" : url ? "Replace" : "Add photo"}
          </button>
          {url && (paid || !opts.chips) && (
            <button
              type="button"
              onClick={() => void remove(slot)}
              disabled={!!busy}
              className="flex items-center gap-1 rounded-xl px-3 py-2 text-[13.5px] text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 size={13} /> Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  const otherOf = (s: Slot): Slot => (s === "tall" ? "wide" : "tall");

  return (
    <div>
      <p className="text-[15px] font-semibold text-spark-ink">
        {paid ? "Your photos" : "Your photo"}
        {!paid && <span className="ml-2 rounded-full bg-spark-amber-tint px-2.5 py-0.5 text-[12px] font-semibold text-[#A3660F]">Free: 1 photo</span>}
      </p>
      <p className="mb-3 text-[13.5px] text-spark-ink-muted">
        {paid ? "Add both for the best videos." : "Choose the shape you post most."}
      </p>
      <div className="grid items-stretch gap-4 sm:grid-cols-2">
        {paid ? (
          <>
            {slotCard("tall", { title: "Vertical", tag: "Reels & Shorts" })}
            {slotCard("wide", { title: "Horizontal", tag: "YouTube" })}
          </>
        ) : (
          <>
            {slotCard(freeShape, { title: "Your photo", chips: true })}
            <div className="flex h-full flex-col gap-3 rounded-xl border border-spark-rule bg-white p-4">
              <div>
                <p className="text-[15px] font-semibold text-spark-ink">Second photo</p>
                <p className="text-[13px] text-spark-ink-muted">{otherOf(freeShape) === "tall" ? "Vertical" : "Horizontal"}</p>
              </div>
              <div className="flex h-[190px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[#e3dccf] bg-[#f7f4ee] text-[13px] text-spark-ink-faint">
                <Lock size={16} /> Paid plans
              </div>
              <div className="mt-auto">
                <Link href={UPGRADE_HREF} className="inline-block rounded-xl border border-spark-rule px-4 py-2 text-[14px] font-semibold text-spark-ink">
                  View Plans
                </Link>
              </div>
            </div>
          </>
        )}
      </div>
      <label className="mt-3 flex cursor-pointer select-none items-center gap-2 text-[13px] text-spark-ink-muted">
        <input type="checkbox" checked={removeBg} disabled={!!busy} onChange={(e) => setRemoveBg(e.target.checked)} />
        🪄 Remove photo background <span className="text-spark-ink-faint">(replaced with clean white)</span>
      </label>
      {regError && (
        <button
          type="button"
          onClick={() => { setBusy(regError.slot); void save(regError.slot, regError.url).catch(() => {}).finally(() => setBusy(null)); }}
          className="mt-2 flex items-center gap-1 text-[13px] font-semibold text-amber-700"
        >
          <RefreshCw size={12} /> Retry avatar update
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
