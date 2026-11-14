"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CITED_LABEL, ENGINES, ENGINE_LABEL, QUESTIONS_PER_TOWN, type Engine } from "@/lib/ai-visibility/shared";
import type { QuestionResult, TownSummary } from "@/lib/ai-visibility/summary";

/**
 * AI Visibility on Spark Insights (2026-11-14, the owner's approved mockup,
 * docs/mockups/ai-visibility-mockup.html). Each town's top searches, asked of
 * ChatGPT and Perplexity every Sunday night: was the agent named, was one of
 * their links cited, and who did AI use instead.
 */

interface Links { website: string | null; halo: number; channel: boolean; videos: number; card: boolean; named: boolean }
interface Data { limit: number; towns: TownSummary[]; links: Links }

const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null) return <p className="mt-0.5 text-[13px] text-slate-400">First week</p>;
  const d = now - before;
  if (d === 0) return <p className="mt-0.5 text-[13px] text-slate-400">Same as last week</p>;
  return <p className={`mt-0.5 text-[13px] font-semibold ${d > 0 ? "text-green-700" : "text-red-700"}`}>{d > 0 ? "+" : "−"}{Math.abs(d)} from last week</p>;
}

function Mark({ r, engine }: { r: QuestionResult; engine: Engine }) {
  const x = r.engines[engine];
  const base = "inline-flex w-max items-center rounded-full border px-2.5 py-0.5 text-[13px] font-bold";
  if (!x || !x.ok) return <span className={`${base} border-spark-rule text-slate-400`} title="Couldn't check this week">?</span>;
  if (x.cited.length) return <span className={`${base} border-[#f1d9b0] bg-spark-amber-tint text-spark-amber`}>Cited</span>;
  if (x.named) return <span className={`${base} border-green-200 bg-green-50 text-green-700`}>Named</span>;
  return <span className={`${base} border-spark-rule text-slate-400`}>–</span>;
}

/** The small line under a question: its search, then what happened. */
function detail(r: QuestionResult): string {
  const parts: string[] = [];
  if (r.search) parts.push(`Search: "${r.search}"`);
  const all = ENGINES.map((e) => r.engines[e]).filter((x): x is NonNullable<typeof x> => !!x && x.ok);
  const cited = all.flatMap((x) => x.cited);
  if (cited.length) parts.push(`Cited: ${Array.from(new Set(cited.map((c) => CITED_LABEL[c.kind]))).join(", ")}`);
  else {
    const namers = ENGINES.filter((e) => r.engines[e]?.named).map((e) => ENGINE_LABEL[e]);
    if (namers.length) parts.push(`Named by ${namers.join(" and ")}, no link`);
    else {
      const domains = Array.from(new Set(all.flatMap((x) => x.domains))).slice(0, 2);
      parts.push(domains.length ? `AI used ${domains.join(", ")}` : all.length ? "Not yet" : "Not checked yet");
    }
  }
  return parts.join(" · ");
}

export function AiVisibility() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [townId, setTownId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTown, setNewTown] = useState("");
  const [newState, setNewState] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [website, setWebsite] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-visibility");
      if (!res.ok) throw new Error(String(res.status));
      const d = (await res.json()) as Data;
      setData(d);
      setTownId((cur) => (cur && d.towns.some((t) => t.id === cur) ? cur : d.towns[0]?.id ?? null));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // While a check runs, look again every 20 seconds.
  const checking = !!data?.towns.some((t) => t.status === "checking");
  useEffect(() => {
    if (!checking) return;
    const t = setInterval(() => { void load(); }, 20_000);
    return () => clearInterval(t);
  }, [checking, load]);

  async function addTown() {
    setBusy(true);
    try {
      const res = await fetch("/api/ai-visibility/towns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ town: newTown, state: newState }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Couldn't add the town.");
      setAdding(false); setNewTown(""); setNewState("");
      setTownId(b.id ?? null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the town.");
    } finally { setBusy(false); }
  }

  async function saveQuestions(id: string) {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai-visibility/towns", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, questions: editing }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Couldn't save.");
      setEditing(null);
      toast.success("Saved. They're checked on Sunday night.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  }

  async function removeTown(id: string) {
    if (!window.confirm("Remove this town and its history?")) return;
    setBusy(true);
    await fetch(`/api/ai-visibility/towns?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    setEditing(null);
    setBusy(false);
    await load();
  }

  async function saveWebsite() {
    setBusy(true);
    try {
      const res = await fetch("/api/ai-visibility/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: website ?? "" }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error || "Couldn't save.");
      setWebsite(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  }

  const heading = (
    <h3 className="flex items-center gap-2 font-semibold text-brand-text">
      <Sparkles size={16} className="text-slate-400" /> AI Visibility
    </h3>
  );

  if (failed) return <Card>{heading}<p className="mt-3 text-sm text-slate-400">Couldn&apos;t load this. Refresh to try again.</p></Card>;
  if (!data) return <Card>{heading}<p className="mt-3 flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading…</p></Card>;

  const town = data.towns.find((t) => t.id === townId) ?? null;
  const left = Math.max(0, data.limit - data.towns.length);
  const missing = town?.results.filter((r) => ENGINES.every((e) => { const x = r.engines[e]; return x?.ok && !x.named && !x.cited.length; })) ?? [];

  const addForm = (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={newTown} onChange={(e) => setNewTown(e.target.value)} placeholder="Town"
        className="w-44 rounded-xl border border-spark-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-spark-amber"
      />
      <select
        value={newState} onChange={(e) => setNewState(e.target.value)}
        className="rounded-xl border border-spark-rule bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-spark-amber"
      >
        <option value="">State</option>
        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button
        type="button" onClick={addTown} disabled={busy || newTown.trim().length < 2 || !newState}
        className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Adding…" : "Add town"}
      </button>
      {data.towns.length > 0 && (
        <button type="button" onClick={() => setAdding(false)} className="px-2 text-sm text-slate-500">Cancel</button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {heading}
            <p className="mt-0.5 text-sm text-slate-500">
              {town?.lastCheckedAt ? `Checked ${shortDate(town.lastCheckedAt)} · ` : ""}top {QUESTIONS_PER_TOWN} searches · ChatGPT and Perplexity
            </p>
          </div>
          {town && !editing && (
            <button
              type="button" onClick={() => setEditing(town.questions.map((q) => q.q))}
              className="rounded-xl border border-spark-rule bg-white px-3.5 py-2 text-sm font-semibold text-brand-text hover:border-spark-amber"
            >
              Edit questions
            </button>
          )}
        </div>

        {/* Towns */}
        {data.towns.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.towns.map((t) => (
              <button
                key={t.id} type="button" onClick={() => { setTownId(t.id); setEditing(null); }}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${t.id === townId ? "border-brand-text bg-brand-text text-white" : "border-spark-rule bg-white text-slate-600"}`}
              >
                {t.town}, {t.state}
              </button>
            ))}
            {left > 0 && !adding && (
              <button
                type="button" onClick={() => setAdding(true)}
                className="flex items-center gap-1 rounded-full border border-dashed border-[#f1d9b0] bg-spark-amber-tint px-3.5 py-1.5 text-sm font-semibold text-spark-amber"
              >
                <Plus size={14} /> Add town · {left} left
              </button>
            )}
          </div>
        )}
        {(adding || data.towns.length === 0) && (
          <div className="mt-4">
            {data.towns.length === 0 && <p className="mb-2 text-sm text-slate-600">Which town do you want AI to know you for?</p>}
            {addForm}
          </div>
        )}

        {town?.status === "checking" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Checking {town.town} now. It takes a few minutes.
          </p>
        )}

        {/* Edit questions */}
        {town && editing && (
          <div className="mt-4 space-y-2">
            {editing.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={q} onChange={(e) => setEditing((list) => list?.map((x, j) => (j === i ? e.target.value : x)) ?? null)}
                  className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-spark-amber"
                />
                <button type="button" aria-label="Remove question" onClick={() => setEditing((list) => list?.filter((_, j) => j !== i) ?? null)} className="p-1 text-slate-400 hover:text-slate-700">
                  <X size={16} />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {editing.length < QUESTIONS_PER_TOWN && (
                <button type="button" onClick={() => setEditing((list) => [...(list ?? []), ""])} className="flex items-center gap-1 rounded-xl border border-dashed border-spark-rule px-3 py-2 text-sm text-slate-600">
                  <Plus size={14} /> Add question
                </button>
              )}
              <button type="button" onClick={() => saveQuestions(town.id)} disabled={busy} className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Save
              </button>
              <button type="button" onClick={() => setEditing(null)} className="px-2 text-sm text-slate-500">Cancel</button>
              <button type="button" onClick={() => removeTown(town.id)} disabled={busy} className="ml-auto text-sm text-red-600 hover:underline">
                Remove town
              </button>
            </div>
          </div>
        )}
      </Card>

      {town && town.week && !editing && (
        <>
          {/* Score */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-[13px] font-semibold text-slate-500">Named in answers</p>
              <p className="mt-1 text-3xl font-extrabold text-brand-text">{town.named} <span className="text-base font-semibold text-slate-400">of {town.answers}</span></p>
              <Delta now={town.named} before={town.prevNamed} />
            </Card>
            <Card>
              <p className="text-[13px] font-semibold text-slate-500">Your links cited</p>
              <p className="mt-1 text-3xl font-extrabold text-brand-text">{town.cited}</p>
              <Delta now={town.cited} before={town.prevCited} />
            </Card>
            <Card>
              <p className="text-[13px] font-semibold text-slate-500">Last 8 weeks</p>
              <div className="mt-2 flex h-11 items-end gap-1.5">
                {(() => {
                  const max = Math.max(1, ...town.trend.map((w) => w.named + w.cited));
                  return town.trend.map((w, i) => (
                    <i
                      key={w.week} title={`Week of ${w.week}: named ${w.named}, cited ${w.cited}`}
                      className={`flex-1 rounded-sm ${i === town.trend.length - 1 ? "bg-spark-amber" : "bg-[#f1d9b0]"}`}
                      style={{ height: `${Math.max(6, ((w.named + w.cited) / max) * 100)}%` }}
                    />
                  ));
                })()}
              </div>
            </Card>
          </div>

          {/* Questions */}
          <Card>
            <div className="hidden grid-cols-[1fr_96px_96px_150px] gap-3 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>Question</span><span>ChatGPT</span><span>Perplexity</span><span />
            </div>
            {town.results.map((r) => (
              <div key={r.q} className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 border-t border-spark-rule py-3 md:grid-cols-[1fr_96px_96px_150px]">
                <div className="col-span-2 md:col-span-1">
                  <p className="text-[15px] font-semibold text-brand-text">{r.q}</p>
                  <p className="text-[13px] text-slate-500">{detail(r)}</p>
                </div>
                <span className="flex items-center gap-1.5"><span className="text-xs text-slate-400 md:hidden">ChatGPT</span><Mark r={r} engine="chatgpt" /></span>
                <span className="flex items-center gap-1.5"><span className="text-xs text-slate-400 md:hidden">Perplexity</span><Mark r={r} engine="perplexity" /></span>
                <span className="col-span-2 md:col-span-1">
                  {missing.includes(r) && (
                    <Link
                      href={`/create?topic=${encodeURIComponent(r.q)}&city=${encodeURIComponent(town.town)}&state=${encodeURIComponent(town.state)}`}
                      className="inline-flex rounded-xl bg-spark-amber px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#A3660F]"
                    >
                      Make a video
                    </Link>
                  )}
                </span>
              </div>
            ))}
            <p className="mt-2 text-[13px] text-slate-400">AI answers change each time. Watch the trend.</p>
          </Card>

          {/* Two columns, even */}
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            <Card className="flex h-full flex-col">
              <h4 className="mb-2 font-semibold text-brand-text">Who AI cited instead</h4>
              {town.citedInstead.length ? town.citedInstead.map((c) => (
                <div key={c.domain} className="flex justify-between border-t border-spark-rule py-2 text-[15px] first:border-t-0">
                  <span className="truncate pr-3">{c.domain}</span><span className="text-slate-500">{c.count}</span>
                </div>
              )) : <p className="text-sm text-slate-400">No other sites this week.</p>}
              <p className="mt-auto pt-3 text-[13px] text-slate-400">From this week&apos;s {town.answers} answers.</p>
            </Card>
            <Card className="flex h-full flex-col">
              <h4 className="mb-2 font-semibold text-brand-text">Your links</h4>
              <div className="flex flex-wrap gap-2">
                {data.links.halo > 0 && <span className="rounded-full border border-spark-rule px-3 py-1 text-sm"><b className="text-green-700">✓</b> Halo site</span>}
                {data.links.channel && <span className="rounded-full border border-spark-rule px-3 py-1 text-sm"><b className="text-green-700">✓</b> YouTube channel</span>}
                {data.links.videos > 0 && <span className="rounded-full border border-spark-rule px-3 py-1 text-sm"><b className="text-green-700">✓</b> {data.links.videos} YouTube video{data.links.videos === 1 ? "" : "s"}</span>}
                {data.links.card && <span className="rounded-full border border-spark-rule px-3 py-1 text-sm"><b className="text-green-700">✓</b> Video Business Card</span>}
                {data.links.website && website === null && (
                  <button type="button" onClick={() => setWebsite(data.links.website ?? "")} className="rounded-full border border-spark-rule px-3 py-1 text-sm">
                    <b className="text-green-700">✓</b> {data.links.website.replace(/^https?:\/\//, "")}
                  </button>
                )}
                {!data.links.website && website === null && (
                  <button type="button" onClick={() => setWebsite("")} className="rounded-full border border-dashed border-[#f1d9b0] bg-spark-amber-tint px-3 py-1 text-sm font-semibold text-spark-amber">
                    + Your website
                  </button>
                )}
              </div>
              {website !== null && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourwebsite.com"
                    className="min-w-0 flex-1 rounded-xl border border-spark-rule px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-spark-amber"
                  />
                  <button type="button" onClick={saveWebsite} disabled={busy} className="rounded-xl bg-spark-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setWebsite(null)} className="px-2 text-sm text-slate-500">Cancel</button>
                </div>
              )}
              <p className="mt-auto pt-3 text-[13px] text-slate-400">
                {data.links.named ? "Your name counts too." : "Add your name in Settings so answers that name you count."}
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
