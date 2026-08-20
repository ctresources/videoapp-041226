"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Palette } from "lucide-react";
import toast from "react-hot-toast";

interface BrandKit {
  id: string;
  name: string;
}

interface Props {
  userId: string;
  currentBrandKitId: string | null;
  onUpdate?: (brandKitId: string | null) => void;
}

/**
 * Picks which HeyGen brand kit the Video Agent applies.
 *
 * Before this, branding was a request inside the prompt — "display the attached
 * agent/brokerage logo prominently (top-left or top-center)" — which a
 * generative agent is free to interpret or ignore, so the same logo landed
 * differently from video to video. A brand kit is applied by HeyGen to
 * everything the agent builds.
 *
 * Renders nothing when the account has no brand kits, rather than showing an
 * empty dropdown for a feature the user can't act on from here.
 */
export function BrandKitPicker({ userId, currentBrandKitId, onUpdate }: Props) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [selected, setSelected] = useState(currentBrandKitId ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/heygen-brand-kits")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setKits(Array.isArray(d.brandKits) ? d.brandKits : []);
      })
      .catch(() => {
        if (!cancelled) setKits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function save(value: string) {
    setSelected(value);
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ heygen_brand_kit_id: value || null })
        .eq("id", userId);
      if (error) throw error;
      onUpdate?.(value || null);
      toast.success(value ? "Brand kit applied to new videos." : "Brand kit turned off.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the brand kit");
      setSelected(currentBrandKitId ?? "");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-spark-ink-faint">
        <Loader2 size={13} className="animate-spin" /> Checking for brand kits…
      </div>
    );
  }

  if (kits.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Palette size={15} className="text-spark-amber" />
        <p className="text-[14px] font-medium text-spark-ink">Brand kit</p>
      </div>
      <p className="text-[13px] leading-[1.5] text-spark-ink-muted">
        Applies your brand colors, fonts and logo to every graphic in the video, instead of
        asking the AI to place them.
      </p>
      <div className="relative max-w-sm">
        <select
          value={selected}
          disabled={saving}
          onChange={(e) => save(e.target.value)}
          className="w-full appearance-none rounded-[9px] border border-spark-rule bg-white px-3 py-2.5 pr-8 text-[15px] text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber disabled:opacity-60"
        >
          <option value="">None — let the AI style it</option>
          {kits.map((k) => (
            <option key={k.id} value={k.id}>{k.name}</option>
          ))}
        </select>
        {saving && (
          <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-spark-ink-faint" />
        )}
      </div>
      <p className="text-[12px] text-spark-ink-faint">
        Brand kits are created in your HeyGen account.
      </p>
    </div>
  );
}
