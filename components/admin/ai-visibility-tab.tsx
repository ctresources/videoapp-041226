"use client";

import { Fragment, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ENGINES, ENGINE_LABEL } from "@/lib/ai-visibility/shared";
import type { TownSummary } from "@/lib/ai-visibility/summary";

/**
 * Admin → AI Visibility (2026-11-14, the owner's approved mockup): every
 * agent's towns, this week's score and the change from last week. A row
 * opens that town's questions.
 */
type Agent = TownSummary & { userId: string; name: string; plan: string };

function change(now: number, before: number | null) {
  if (before === null) return <span className="text-slate-400">first week</span>;
  const d = now - before;
  if (d === 0) return <span className="text-slate-400">same</span>;
  return <span className={d > 0 ? "font-bold text-green-700" : "font-bold text-red-700"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
}

export function AiVisibilityTab() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai-visibility")
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((b) => setAgents(b.agents ?? []))
      .catch(() => setAgents([]));
  }, []);

  if (!agents) return <Card><p className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Loading…</p></Card>;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-brand-text">AI Visibility</h3>
        <p className="text-sm text-slate-500">{agents.length} town{agents.length === 1 ? "" : "s"} · checked Sunday nights</p>
      </div>
      {agents.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No agent has opened AI Visibility yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="pb-2 font-medium">Agent</th>
                <th className="pb-2 font-medium">Town</th>
                <th className="pb-2 font-medium">Plan</th>
                <th className="pb-2 font-medium">Named</th>
                <th className="pb-2 font-medium">Cited</th>
                <th className="pb-2 font-medium">vs last week</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <Fragment key={a.id}>
                  <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td className="py-2 pr-3 font-medium text-slate-800">{a.name}</td>
                    <td className="py-2 pr-3 text-slate-600">{a.town}, {a.state}</td>
                    <td className="py-2 pr-3 text-slate-500">{a.plan}</td>
                    <td className="py-2 pr-3 font-semibold tabular-nums">{a.week ? `${a.named} of ${a.answers}` : a.status === "checking" ? "Checking…" : "—"}</td>
                    <td className="py-2 pr-3 font-semibold tabular-nums">{a.week ? a.cited : "—"}</td>
                    <td className="py-2">{a.week ? change(a.named + a.cited, a.prevNamed === null ? null : a.prevNamed + (a.prevCited ?? 0)) : ""}</td>
                  </tr>
                  {open === a.id && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-3 py-3">
                        {a.results.length === 0 ? (
                          <p className="text-xs text-slate-400">No results yet.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {a.results.map((r) => (
                              <li key={r.q} className="text-xs text-slate-600">
                                <span className="font-medium text-slate-800">{r.q}</span>{" "}
                                {ENGINES.map((e) => {
                                  const x = r.engines[e];
                                  const mark = !x ? "–" : !x.ok ? "not checked" : x.cited.length ? "cited" : x.named ? "named" : "–";
                                  return <span key={e} className="ml-2 text-slate-500">{ENGINE_LABEL[e]}: {mark}</span>;
                                })}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
