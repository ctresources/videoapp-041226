"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Your first Spark · Quick win", from the owner's mock (2026-10-14).
 *
 * Only for an account that has not made a video yet: a market update for the
 * agent's own town is the easiest first video to say yes to. Pressing it puts
 * that topic in the box; the script is researched and written on Next, as
 * with any topic.
 */
export function FirstSparkBanner({ city, state, onUse }: {
  city: string;
  state: string;
  onUse: (topic: string) => void;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase
          .from("generated_videos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (!stop) setShow((count ?? 0) === 0);
      } catch { /* not shown */ }
    })();
    return () => { stop = true; };
  }, []);

  if (!show) return null;
  const place = city.trim() || "your area";
  const where = [city.trim(), state.trim().toUpperCase()].filter(Boolean).join(", ") || "my area";

  return (
    <button
      type="button"
      onClick={() => onUse(
        `This month's market update for ${where}: prices, how many homes are for sale, how fast they're selling, and what it means for buyers and sellers right now`,
      )}
      className="flex w-full items-start gap-3 rounded-[16px] border border-[#ecd3a8] bg-[#fdf6ea] px-3.5 py-2 text-left transition-colors hover:border-spark-amber"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl spark-cta-gradient text-white">
        <Zap size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3660F]">
          Your first Spark · Quick win
        </span>
        <span className="block text-[15px] font-bold leading-snug text-spark-ink">
          Make your first market update for {place} in 2 minutes
        </span>
        <span className="block text-[13px] leading-snug text-spark-ink-muted">
          We&apos;ll pull this month&apos;s local talking points — you just hit the mic and react to them.
        </span>
      </span>
    </button>
  );
}
