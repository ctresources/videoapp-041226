"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Admin → Halo (2026-10-24, the owner's ask): agents who pressed Get Halo, to
 * match against the Halo dashboard. Halo signs people up by text, so the phone
 * is the surest match. "Signed up" is ticked by hand; Halo can't tell us.
 */
interface Agent {
  userId: string; name: string | null; email: string; phone: string | null; plan: string | null;
  clicks: number; firstAt: string; lastAt: string; link: string; whose: string; signedUpAt: string | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function HaloTab() {
  const [agents, setAgents] = useState<Agent[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/halo-clicks")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((b) => setAgents(b.agents ?? []))
      .catch(() => setAgents([]));
  }, []);

  async function mark(a: Agent, signedUp: boolean) {
    setAgents((list) => list?.map((x) => (x.userId === a.userId ? { ...x, signedUpAt: signedUp ? new Date().toISOString() : null } : x)) ?? null);
    const res = await fetch("/api/admin/halo-clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: a.userId, signedUp }),
    });
    if (!res.ok) {
      toast.error("Couldn't save that.");
      setAgents((list) => list?.map((x) => (x.userId === a.userId ? a : x)) ?? null);
    }
  }

  if (!agents) return <Card><p className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading…</p></Card>;

  const signed = agents.filter((a) => a.signedUpAt).length;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-brand-text">Get Halo presses</h3>
        <p className="text-sm text-slate-500">{agents.length} agent{agents.length === 1 ? "" : "s"} · {signed} signed up</p>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Everyone who pressed Get Halo in Settings. Find them on your Halo dashboard by phone or email, then tick Signed up.
      </p>
      {agents.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No one has pressed Get Halo yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Agent</th>
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Plan</th>
                <th className="py-2 pr-3">Presses</th>
                <th className="py-2 pr-3">Last</th>
                <th className="py-2 pr-3">Whose link</th>
                <th className="py-2">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.userId} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <p className="font-medium text-slate-800">{a.name || "—"}</p>
                    <p className="text-xs text-slate-500">{a.email}</p>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">{a.phone || "—"}</td>
                  <td className="py-2 pr-3 capitalize text-slate-700">{a.plan || "—"}</td>
                  <td className="py-2 pr-3 text-slate-700">{a.clicks}{a.clicks > 1 && <span className="text-xs text-slate-400"> · first {day(a.firstAt)}</span>}</td>
                  <td className="py-2 pr-3 text-slate-700">{day(a.lastAt)}</td>
                  <td className="py-2 pr-3">
                    <p className="text-slate-700">{a.whose}</p>
                    <p className="max-w-[220px] truncate text-xs text-slate-400">{a.link.replace(/^https?:\/\//, "")}</p>
                  </td>
                  <td className="py-2">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input type="checkbox" checked={!!a.signedUpAt} onChange={(e) => void mark(a, e.target.checked)} />
                      {a.signedUpAt ? day(a.signedUpAt) : "No"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
