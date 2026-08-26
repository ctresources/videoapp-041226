"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Palette, X, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";

interface BrandKitDetail {
  id: string;
  name: string;
  status: "loading" | "completed" | "error";
  colors: string[];
  hasLogo: boolean;
}

interface Props {
  currentBrandKitId: string | null;
  onUpdate?: (brandKitId: string | null) => void;
}

const POLL_MS = 3000;
const MAX_POLLS = 40; // ~2 minutes — HeyGen's assembly is usually much faster

/**
 * Builds a brand kit from the agent's own website — no dropdown, no picking
 * from a list that used to show every other agent's kit too (the old version
 * called HeyGen's account-wide GET /v3/brand-kits, which isn't scoped per
 * user). One kit per profile now, built via POST /v3/brand-kits and stored
 * as heygen_brand_kit_id, the same column renders already read.
 */
export function BrandKitPicker({ currentBrandKitId, onUpdate }: Props) {
  const [kit, setKit] = useState<BrandKitDetail | null>(null);
  const [checking, setChecking] = useState(!!currentBrandKitId);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const pollCountRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/profile/heygen-brand-kits");
    const body = await res.json().catch(() => null);
    const found = (body?.brandKit ?? null) as BrandKitDetail | null;
    setKit(found);
    return found;
  }, []);

  const poll = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setTimeout(async () => {
      pollCountRef.current += 1;
      const found = await fetchStatus();
      if (!found || found.status === "loading") {
        if (pollCountRef.current < MAX_POLLS) poll();
        else toast.error("Still building after a couple minutes — check back shortly.");
      }
    }, POLL_MS);
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    if (!currentBrandKitId) { setChecking(false); return; }
    fetchStatus().then((found) => {
      setChecking(false);
      if (found?.status === "loading") { pollCountRef.current = 0; poll(); }
    });
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBuild() {
    if (!urlInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/heygen-brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't build a brand kit from that URL");
      setKit(body.brandKit);
      onUpdate?.(body.brandKit?.id ?? null);
      toast.success("Building your brand kit — this takes a moment…");
      pollCountRef.current = 0;
      poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build a brand kit from that URL");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/profile/heygen-brand-kits", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't turn off the brand kit");
      stopPolling();
      setKit(null);
      setUrlInput("");
      onUpdate?.(null);
      toast.success("Brand kit turned off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn off the brand kit");
    } finally {
      setRemoving(false);
    }
  }

  if (checking) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-spark-ink-faint">
        <Loader2 size={13} className="animate-spin" /> Checking your brand kit…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Palette size={15} className="text-spark-amber" />
        <p className="text-[14px] font-medium text-spark-ink">Brand kit</p>
      </div>
      <p className="text-[13px] leading-[1.5] text-spark-ink-muted">
        Applies your brand colors, fonts and logo to every graphic in the video, instead of
        asking the AI to place them. Built automatically from your own website.
      </p>

      {!kit && (
        <div className="flex max-w-sm items-center gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !submitting) handleBuild(); }}
            placeholder="youragentsite.com"
            disabled={submitting}
            className="min-w-0 flex-1 rounded-[9px] border border-spark-rule bg-white px-3 py-2.5 text-[15px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleBuild}
            disabled={submitting || !urlInput.trim()}
            className="spark-cta-gradient flex shrink-0 items-center gap-1.5 rounded-[9px] px-3.5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Palette size={13} />}
            Build it
          </button>
        </div>
      )}

      {kit?.status === "loading" && (
        <div className="flex items-center gap-2 text-[13px] text-spark-ink-muted">
          <Loader2 size={13} className="animate-spin text-spark-amber" />
          Building your brand kit from your site — usually under a minute.
        </div>
      )}

      {kit?.status === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-red-600">Couldn&rsquo;t build a brand kit from that site. Try a different URL?</p>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="self-start text-[13px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Try again
          </button>
        </div>
      )}

      {kit?.status === "completed" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1.5 text-[13px] text-spark-ink">
            <CheckCircle2 size={15} className="text-emerald-500" />
            Applying to every new video
          </div>
          {kit.colors.length > 0 && (
            <div className="flex items-center gap-1.5">
              {kit.colors.slice(0, 6).map((c, i) => (
                <span
                  key={i}
                  className="h-6 w-6 rounded-full border border-spark-rule"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              {kit.hasLogo && (
                <span className="ml-1.5 text-[12px] text-spark-ink-faint">+ logo detected</span>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="flex items-center gap-1 self-start text-[13px] font-medium text-spark-ink-faint hover:text-red-600 disabled:opacity-50"
          >
            {removing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
            Turn off
          </button>
        </div>
      )}
    </div>
  );
}
