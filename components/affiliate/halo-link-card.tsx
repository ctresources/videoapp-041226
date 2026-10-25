"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * "Your Halo affiliate link" on the Affiliate page (2026-10-24, the owner's
 * mockup): an affiliate who is also a Halo affiliate saves their Halo page or
 * code, and agents they referred to SparkReels get it on their Get Halo button.
 */
export function HaloLinkCard({ initial }: { initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState<string | null>(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/affiliate/halo-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: value }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't save it.");
      setSaved(d.haloLink ?? null);
      setValue(d.haloLink ?? "");
      toast.success(d.haloLink ? "Saved. Agents you refer get your Halo link." : "Removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save it.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Your Halo affiliate link</p>
      <p className="text-sm text-slate-500 mb-3">Agents you refer to SparkReels get your link on their Get Halo button.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          placeholder="halo-your-name.huzi.site or your code"
          name="halo-affiliate-link"
          autoComplete="off"
          className="flex-1 min-w-[220px] text-[16px] sm:text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 outline-none focus:border-primary-500"
        />
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={(value.trim() || null) === saved}>Save</Button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Your Halo affiliate page, or just your code. With only a code, the button texts &ldquo;CODE PRO&rdquo; to Halo instead.
      </p>
      {saved && (
        <p className="mt-2 inline-block rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">✓ Saved · {saved.replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
      )}
    </Card>
  );
}
