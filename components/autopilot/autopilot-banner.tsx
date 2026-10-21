"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";

/**
 * "Your week is ready" at the top of My Sparks, while Autopilot drafts are
 * waiting to be reviewed (2026-10-21). Shows nothing otherwise.
 */
export function AutopilotBanner() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    const d = new Date();
    d.setDate(d.getDate() - 7);
    createClient()
      .from("autopilot_drafts")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft")
      .gte("slot_at", d.toISOString())
      .then(({ count: c }) => setCount(c ?? 0));
  }, [user]);
  if (!count) return null;
  return (
    <Link
      href="/autopilot"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-spark-amber/40 bg-spark-amber-tint px-4 py-3 transition hover:brightness-[0.98]"
    >
      <Sparkles size={18} className="shrink-0 text-spark-amber" />
      <span className="min-w-0 flex-1 text-sm text-spark-ink">
        <strong>Your week is ready</strong> · {count} draft{count === 1 ? "" : "s"} to review
      </span>
      <span className="text-sm font-semibold text-[#A3660F]">Review →</span>
    </Link>
  );
}
