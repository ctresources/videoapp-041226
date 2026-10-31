"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ExternalLink, Loader2 } from "lucide-react";

/**
 * Admin → Staff activity (2026-10-30, the owner's approved mockup; admins
 * only): flags, each staff member's month, what they made and where it went,
 * everything else they did, and their access (publishing, emails, AutoSparks,
 * video cap). Data: /api/admin/staff-activity.
 */

type Publish = "off" | "approved" | "any";
interface Perm { publish: Publish; approved: string[]; emails: boolean; autosparks: boolean }
interface Post { platform: string; account: string; status: string; url: string | null; approved: boolean | null; platformId: string }
interface Vid { id: string; title: string; kind: string; at: string; url: string | null; status: string | null; counted: boolean; posts: Post[]; emailed: boolean }
interface Person {
  id: string; name: string; email: string | null; timeZone: string | null; lastActive: string | null; minutesInApp: number; daysInApp: number;
  cap: number; used: number; permissions: Perm; accounts: { platform: string; label: string; account: string }[];
  totals: { videos: number; posts: number; emails: number; approvals: number };
  everything: Record<string, Record<string, number>>;
  videos: Vid[]; emails: { kind: string; subject: string | null; people: number; at: string }[];
  flags: { level: "red" | "amber" | "grey"; text: string; videoId?: string; platform?: string }[];
}
interface Data { month: string; ownerTimeZone: string; staff: Person[]; invites: { email: string; video_cap: number }[] }

const months = () => Array.from({ length: 6 }, (_, i) => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
  return d.toISOString().slice(0, 7);
});
const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const PLATFORMS = ["youtube", "facebook", "instagram", "linkedin", "tiktok", "x", "threads", "google_business"];
const PLABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads", google_business: "Google Business" };

function when(iso: string | null, tz: string | null | undefined) {
  if (!iso) return "never";
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", ...(tz && { timeZone: tz }) }); }
  catch { return new Date(iso).toLocaleString(); }
}
const city = (tz: string | null | undefined) => (tz ? tz.split("/").pop()!.replace(/_/g, " ") : "");

export function StaffTab() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/staff-activity?month=${month}`);
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't load staff activity."); return; }
      setData(out as Data);
      setPick((p) => p ?? (out as Data).staff[0]?.id ?? null);
    } finally { setLoading(false); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  async function save(userId: string, patch: { permissions?: Perm; cap?: number }) {
    const res = await fetch("/api/admin/staff-activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...patch }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error || "Couldn't save."); return; }
    toast.success("Saved.");
    void load();
  }

  if (!data) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-600" /></div>;
  const p = data.staff.find((x) => x.id === pick) ?? data.staff[0];
  const allFlags = data.staff.flatMap((s) => s.flags.map((f) => ({ ...f, person: s })));
  const dot = { red: "bg-red-600", amber: "bg-amber-500", grey: "bg-slate-400" } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
          {months().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        {loading && <Loader2 size={16} className="animate-spin text-slate-400" />}
        {data.invites.length > 0 && (
          <span className="text-xs text-slate-500">Invited, not signed up yet: {data.invites.map((i) => `${i.email} (cap ${i.video_cap})`).join(", ")}</span>
        )}
      </div>

      {data.staff.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No staff accounts yet.</p>
      ) : (
        <>
          {/* Needs a look */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="mb-2 font-semibold text-slate-800">Needs a look · {allFlags.length}</p>
            {allFlags.length === 0 && <p className="text-sm text-slate-500">Nothing to look at.</p>}
            {allFlags.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2 text-sm first:border-t-0">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot[f.level]}`} />
                <span className="flex-1"><b>{f.person.name}</b> {f.text}.</span>
                {f.platform && (
                  <>
                    <button className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold" onClick={() => void save(f.person.id, { permissions: { ...f.person.permissions, approved: Array.from(new Set([...f.person.permissions.approved, f.platform!])) } })}>Approve account</button>
                    <button className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white" onClick={() => void save(f.person.id, { permissions: { ...f.person.permissions, publish: "approved" } })}>Set to approved only</button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* People */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.staff.map((s) => (
              <button key={s.id} type="button" onClick={() => setPick(s.id)}
                className={`rounded-xl border bg-white p-3.5 text-left ${p?.id === s.id ? "border-blue-500 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-300"}`}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-500">
                      Last active {when(s.lastActive, data.ownerTimeZone)} your time
                      {s.timeZone && s.timeZone !== data.ownerTimeZone ? ` · ${when(s.lastActive, s.timeZone)} ${city(s.timeZone)}` : ""}
                    </p>
                  </div>
                  {s.flags.length > 0
                    ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{s.flags.length} flag{s.flags.length === 1 ? "" : "s"}</span>
                    : <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">OK</span>}
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><i className="block h-full bg-amber-500" style={{ width: `${Math.min(100, (s.used / Math.max(1, s.cap)) * 100)}%` }} /></div>
                <p className="mt-1 text-xs text-slate-500">{s.used} of {s.cap} videos this month · in the app {s.minutesInApp < 60 ? `${s.minutesInApp} min` : `${Math.floor(s.minutesInApp / 60)} h ${s.minutesInApp % 60} min`} over {s.daysInApp} day{s.daysInApp === 1 ? "" : "s"}</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                  {([["Videos", s.totals.videos], ["Posts", s.totals.posts], ["Emails", s.totals.emails], ["Approvals", s.totals.approvals]] as const).map(([l, n]) => (
                    <div key={l} className="rounded-lg bg-slate-50 py-1"><b className="block text-sm">{n}</b><span className="text-[11px] text-slate-500">{l}</span></div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {p && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              {/* Videos */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-2 font-semibold text-slate-800">{p.name} · what they made and where it went</p>
                {p.videos.length === 0 && <p className="text-sm text-slate-500">No videos this month.</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      {p.videos.map((v) => (
                        <tr key={v.id} className="border-t border-slate-100 align-top first:border-t-0">
                          <td className="py-2 pr-3">
                            <p className="font-medium text-slate-800">{v.title}</p>
                            <p className="text-xs text-slate-500">{v.kind} · {when(v.at, data.ownerTimeZone)}{v.status === "failed" ? " · didn't finish" : ""}
                              {v.url && <> · <a href={v.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Watch</a></>}</p>
                          </td>
                          <td className="whitespace-nowrap py-2 pr-3 text-xs">{v.counted ? "Counted" : <span className="text-slate-400">Free</span>}</td>
                          <td className="py-2 text-xs">
                            {v.posts.length === 0 && <span className="text-slate-400">{v.emailed ? "Emailed" : "Not posted"}</span>}
                            {v.posts.map((x, i) => (
                              <span key={i} className={`block ${x.approved === false ? "font-semibold text-red-600" : "text-slate-700"}`}>
                                {x.platform} · {x.account}{x.approved === false ? " (not approved)" : ""}{x.status === "scheduled" ? " · scheduled" : ""}
                                {x.url && <a href={x.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-blue-600"><ExternalLink size={11} /></a>}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* Everything */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="mb-2 font-semibold text-slate-800">Everything they did</p>
                  {Object.entries(p.everything).map(([group, items]) => {
                    const rows = Object.entries(items).filter(([, n]) => n > 0);
                    return (
                      <div key={group} className="border-t border-slate-100 py-1.5 first:border-t-0">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{group}</p>
                        {rows.length === 0 ? <p className="text-xs text-slate-400">None</p> : rows.map(([k, n]) => (
                          <p key={k} className="flex justify-between text-sm"><span className="text-slate-700">{k}</span><b>{n}</b></p>
                        ))}
                      </div>
                    );
                  })}
                  {p.emails.length > 0 && (
                    <div className="border-t border-slate-100 pt-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Emails sent</p>
                      {p.emails.slice(0, 8).map((e, i) => (
                        <p key={i} className="flex justify-between gap-2 text-xs text-slate-600"><span className="truncate">{e.kind}{e.subject ? ` · ${e.subject}` : ""}</span><span className="whitespace-nowrap">{e.people} people · {when(e.at, data.ownerTimeZone)}</span></p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Access */}
                <Access person={p} onSave={(patch) => void save(p.id, patch)} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Access({ person, onSave }: { person: Person; onSave: (patch: { permissions?: Perm; cap?: number }) => void }) {
  const [perm, setPerm] = useState<Perm>(person.permissions);
  const [cap, setCap] = useState(person.cap);
  useEffect(() => { setPerm(person.permissions); setCap(person.cap); }, [person]);
  const seg = (on: boolean) => `px-3 py-1 text-xs font-semibold ${on ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`;
  const connected = new Set(person.accounts.map((a) => a.platform));
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="font-semibold text-slate-800">{person.name}&apos;s access</p>
      <p className="mb-2 text-xs text-slate-500">Set per person.</p>

      <p className="mb-1 mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Publishing</p>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
        {([["off", "Off"], ["approved", "Approved accounts only"], ["any", "Any account"]] as const).map(([k, l]) => (
          <button key={k} type="button" className={seg(perm.publish === k)} onClick={() => setPerm({ ...perm, publish: k })}>{l}</button>
        ))}
      </div>
      {perm.publish === "approved" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLATFORMS.map((pl) => {
            const on = perm.approved.includes(pl);
            const acct = person.accounts.find((a) => a.platform === pl);
            return (
              <button key={pl} type="button"
                onClick={() => setPerm({ ...perm, approved: on ? perm.approved.filter((x) => x !== pl) : [...perm.approved, pl] })}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${on ? "border-green-300 bg-green-50 text-green-700" : "border-slate-200 text-slate-500"}`}>
                {on ? "✓ " : ""}{PLABEL[pl]}{acct ? ` · ${acct.account}` : connected.has(pl) ? "" : " (not connected)"}
              </button>
            );
          })}
        </div>
      )}

      <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Email it, review and seller emails</p>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
        <button type="button" className={seg(!perm.emails)} onClick={() => setPerm({ ...perm, emails: false })}>Off</button>
        <button type="button" className={seg(perm.emails)} onClick={() => setPerm({ ...perm, emails: true })}>On</button>
      </div>

      <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">AutoSparks approvals</p>
      <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
        <button type="button" className={seg(!perm.autosparks)} onClick={() => setPerm({ ...perm, autosparks: false })}>Off</button>
        <button type="button" className={seg(perm.autosparks)} onClick={() => setPerm({ ...perm, autosparks: true })}>On</button>
      </div>

      <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Videos a month</p>
      <input type="number" min={0} max={500} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm" />

      <div className="mt-3">
        <button type="button" onClick={() => onSave({ permissions: perm, cap })} className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white">Save access</button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Off hides the option and the server refuses it. Approved accounts only: Publish shows just those.</p>
    </div>
  );
}
