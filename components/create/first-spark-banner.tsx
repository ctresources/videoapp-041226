"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Quick win", from the owner's mock (2026-10-14).
 *
 * First it showed only to an account with no videos yet. The owner wants it
 * for everyone (2026-10-15), with a different idea each time they sign in, so
 * there is always a one-press topic waiting. Pressing it puts that topic in
 * the box; the script is researched and written on Next, as with any topic.
 */
const IDEAS: { headline: (place: string) => string; topic: (where: string) => string }[] = [
  {
    headline: (p) => `Make a market update for ${p} in 2 minutes`,
    topic: (w) => `This month's market update for ${w}: prices, how many homes are for sale, how fast they're selling, and what it means for buyers and sellers right now`,
  },
  {
    headline: (p) => `Is now a good time to sell in ${p}?`,
    topic: (w) => `Is now a good time to sell a home in ${w}? What sellers are getting right now, how long homes take to sell, and what to do before listing`,
  },
  {
    headline: (p) => `Best neighborhoods in ${p} for first-time buyers`,
    topic: (w) => `The best neighborhoods in ${w} for first-time buyers: prices, commute, schools, and what each one feels like to live in`,
  },
  {
    headline: (p) => `What a home in ${p} costs each month`,
    topic: (w) => `What it really costs to buy a home in ${w} right now: typical price, monthly payment with today's rates, taxes, and insurance`,
  },
  {
    headline: (p) => `Moving to ${p}? 5 things to know`,
    topic: (w) => `Moving to ${w}: five things people should know before they buy a home here, from neighborhoods to commute to what homes cost`,
  },
  {
    headline: (p) => `Things to do in ${p} this month`,
    topic: (w) => `Things to do in ${w} this month: local events, places to eat, and why people love living here`,
  },
];

/** A new idea each sign-in: the pick is kept for the browser session, so it
 *  stays put while they move around the app and changes next time. */
function sessionIdea(): number {
  const KEY = "sr-quick-win-idea";
  try {
    const kept = sessionStorage.getItem(KEY);
    if (kept !== null && Number(kept) >= 0 && Number(kept) < IDEAS.length) return Number(kept);
    const last = Number(localStorage.getItem(KEY) ?? -1);
    let next = Math.floor(Math.random() * IDEAS.length);
    if (next === last) next = (next + 1) % IDEAS.length;
    sessionStorage.setItem(KEY, String(next));
    localStorage.setItem(KEY, String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * IDEAS.length);
  }
}

export function FirstSparkBanner({ city, state, onUse }: {
  city: string;
  state: string;
  onUse: (topic: string) => void;
}) {
  const [idea, setIdea] = useState<number | null>(null);
  const [firstVideo, setFirstVideo] = useState(false);

  useEffect(() => {
    setIdea(sessionIdea());
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
        if (!stop) setFirstVideo((count ?? 0) === 0);
      } catch { /* the plain label */ }
    })();
    return () => { stop = true; };
  }, []);

  if (idea === null) return null;
  // Someone new always starts on the market update: the easiest first yes.
  const pick = IDEAS[firstVideo ? 0 : idea];
  const place = city.trim() || "your area";
  const where = [city.trim(), state.trim().toUpperCase()].filter(Boolean).join(", ") || "my area";

  return (
    <button
      type="button"
      onClick={() => onUse(pick.topic(where))}
      // A white row with no icon, like the buyer questions under it, inside
      // step 1's one card (2026-10-18, the owner's ask).
      className="flex w-full items-start rounded-[12px] border border-spark-rule bg-white px-3 py-2 text-left transition-colors hover:border-spark-amber"
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3660F]">
          {firstVideo ? "Your first Spark · Quick win" : "Quick win"}
        </span>
        <span className="block text-[15px] font-bold leading-snug text-spark-ink">
          {pick.headline(place)}
        </span>
        <span className="block text-[13px] leading-snug text-spark-ink-muted">
          We&apos;ll pull the local talking points — you just hit the mic and react to them.
        </span>
      </span>
    </button>
  );
}
