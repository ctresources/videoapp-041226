"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, FileText, Film, Loader2, Play, X } from "lucide-react";
import toast from "react-hot-toast";
import { SparkleeGoal } from "@/components/home/sparklee-goal";
import { LockedFeature } from "@/components/access/locked-feature";
import { useAccount } from "@/lib/hooks/use-account";
import type { HomeData, HomeApproval } from "@/lib/home/data";

/**
 * Home (2026-10-29, the owner's agentic dashboard): what needs attention,
 * what Sparklee found, what's running, and the week, with Ask Sparklee as the
 * main way in and manual tools one click away. Every number is real.
 */

const LABEL: Record<string, string> = { youtube: "YouTube", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads", google_business: "Google Business" };
const when = (iso: string | null | undefined, tz?: string) => iso
  ? new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", ...(tz && { timeZone: tz }) })
  : "";

function Card({ title, count, link, children, className = "" }: { title: string; count?: number; link?: { href: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-spark-rule bg-white p-3.5 ${className}`}>
      <h2 className="mb-2 flex items-center gap-2 text-[16.5px] font-bold text-spark-ink">
        {title}
        {count !== undefined && count > 0 && <span className="rounded-full bg-spark-amber px-2 py-px text-[12px] font-bold text-white">{count}</span>}
        {link && <Link href={link.href} className="ml-auto text-[13.5px] font-semibold text-[#A3660F] hover:underline">{link.label} →</Link>}
      </h2>
      {children}
    </section>
  );
}
const Empty = ({ children }: { children: ReactNode }) => <p className="py-2 text-[14px] text-spark-ink-muted">{children}</p>;

export function HomeDashboard({ checklist }: { checklist?: ReactNode }) {
  const account = useAccount();
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<{ text: string; n: number } | null>(null);
  const [watch, setWatch] = useState<HomeApproval | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/home").catch(() => null);
    if (!res?.ok) { setFailed(true); return; }
    setData(await res.json());
    setFailed(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Things move while the page is open (renders finish, drafts get written).
  useEffect(() => { const t = setInterval(() => void load(), 60_000); return () => clearInterval(t); }, [load]);

  function askSparklee(text: string) {
    setAsk({ text, n: Date.now() });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function approve(a: HomeApproval) {
    setApproving(a.id);
    try {
      const res = await fetch("/api/halo/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftId: a.id }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't approve it. Try again."); return; }
      toast.success(`Approved. It posts by itself ${when(a.when, data?.timeZone)}.`);
      setWatch(null);
      void load();
    } finally { setApproving(null); }
  }

  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, ...(data && { timeZone: data.timeZone }) }));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = data?.name?.trim().split(/\s+/)[0];
  const paid = data ? data.paid : account?.paid ?? true;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[23px] font-bold text-spark-ink">{greet}{first ? `, ${first}` : ""}</h1>
        <span className="rounded-full bg-[#e8f5ee] px-2.5 py-0.5 text-[12.5px] font-semibold text-[#0f7a52]">✓ Nothing posts until you approve it</span>
      </div>

      {/* Ask Sparklee: the main way to work. */}
      <section className="mt-3 rounded-[20px] p-5 shadow-[0_0_0_2px_#BA7517,0_14px_40px_rgba(186,117,23,0.22)] sm:p-6"
        style={{ background: "radial-gradient(120% 140% at 0% 0%, #2a1f10 0%, #0f0d0b 55%)" }}>
        <SparkleeGoal variant="hero" ask={ask} onApproved={() => { setTimeout(() => void load(), 2500); }} />
      </section>

      {/* For people who want control. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-spark-rule bg-white px-3 py-2">
        <span className="mr-1 text-[14px] font-semibold text-spark-ink-muted">Or create it yourself:</span>
        {[
          { href: "/create", icon: "🎬", label: "Video / Reel", sub: "Avatar + voice" },
          { href: "/create?tab=camera", icon: "📷", label: "Camera", sub: "You on camera" },
          { href: "/create?tab=script", icon: "📝", label: "Blog", sub: "Article + FAQs" },
          { href: "/create?tab=listing", icon: "🏡", label: "Listing", sub: "Photos to video" },
          { href: "/tools", icon: "🧰", label: "Spark Tools", sub: "Reviews, banners, more" },
        ].map((t) => (
          <Link key={t.label} href={t.href} className="min-w-[130px] flex-1 rounded-xl border border-spark-rule bg-[#faf9f5] px-3 py-1.5 hover:border-spark-amber">
            <b className="block text-[14.5px] text-spark-ink">{t.icon} {t.label}</b>
            <span className="text-[12.5px] text-spark-ink-muted">{t.sub}</span>
          </Link>
        ))}
      </div>

      {checklist}

      {failed && !data && <p className="mt-4 text-[14px] text-red-600">Home couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button></p>}
      {!data && !failed && <div className="mt-6 flex justify-center"><Loader2 className="animate-spin text-spark-amber" /></div>}

      {data && (
        <>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Needs Your Approval */}
            {paid ? (
              <Card title="Needs Your Approval" count={data.approvals.length} link={{ href: "/autosparks", label: "AutoSparks" }}>
                {data.approvals.length === 0 && <Empty>Nothing waiting on you.</Empty>}
                {data.approvals.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5 border-t border-spark-rule py-2 first:border-t-0 first:pt-0">
                    <Thumb url={a.thumbUrl} vertical={a.vertical} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-spark-ink">{a.title}</p>
                      <p className="truncate text-[12.5px] text-spark-ink-muted">
                        <span className="mr-1 rounded bg-spark-amber-tint px-1 text-[11px] font-bold text-[#A3660F]">{a.tag}</span>
                        {[when(a.when, data.timeZone), a.platforms.map((p) => LABEL[p] ?? p).join(", ")].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {a.state === "ready" ? (
                      <>
                        <button type="button" onClick={() => setWatch(a)} className="rounded-lg border border-spark-rule px-2 py-1 text-[13px] font-semibold"><Play size={12} className="inline" /> Watch</button>
                        <button type="button" disabled={approving === a.id} onClick={() => void approve(a)} className="rounded-lg bg-spark-amber px-2.5 py-1 text-[13px] font-bold text-white disabled:opacity-60">
                          {approving === a.id ? <Loader2 size={13} className="inline animate-spin" /> : "Approve"}
                        </button>
                      </>
                    ) : (
                      <Link href={a.href} className="rounded-lg border border-spark-amber px-2.5 py-1 text-[13px] font-bold text-[#A3660F]">{a.kind === "seller" ? "Review" : "Make video"}</Link>
                    )}
                  </div>
                ))}
              </Card>
            ) : (
              <LockedFeature compact feature="Needs Your Approval" body="Sparklee prepares drafts for you to approve with a SparkReels plan." />
            )}

            {/* Opportunities Sparklee Found */}
            {paid ? (
              <Card title="Opportunities Sparklee Found" count={data.opportunities.length}>
                {data.opportunities.length === 0 && <Empty>Nothing new right now. Sparklee checks again each day.</Empty>}
                {data.opportunities.map((o) => (
                  <div key={o.id} className="flex items-center gap-2.5 border-t border-spark-rule py-2 first:border-t-0 first:pt-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-spark-amber-tint text-[16px]">{o.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-spark-ink" title={o.title}>{o.title}</p>
                      <p className="truncate text-[12.5px] text-spark-ink-muted">{o.detail}</p>
                    </div>
                    {o.ask ? (
                      <button type="button" onClick={() => askSparklee(o.ask!)} className="rounded-lg border border-spark-rule px-2.5 py-1 text-[13px] font-semibold hover:border-spark-amber">Make draft</button>
                    ) : o.href ? (
                      <Link href={o.href} className="rounded-lg border border-spark-rule px-2.5 py-1 text-[13px] font-semibold hover:border-spark-amber">{o.hrefLabel ?? "Open"}</Link>
                    ) : null}
                  </div>
                ))}
              </Card>
            ) : (
              <LockedFeature compact feature="Opportunities Sparklee Found" body="Sparklee watches your sites, results and calendar for ideas with a SparkReels plan." />
            )}

            {/* Working For You: real states only */}
            <Card title="Working For You">
              {data.working.length === 0 && <Empty>Nothing running right now.</Empty>}
              {data.working.map((w, i) => (
                <div key={i} className="flex items-center gap-2.5 border-t border-spark-rule py-2 first:border-t-0 first:pt-0">
                  <span className={`mx-1 h-2.5 w-2.5 shrink-0 rounded-full ${w.kind === "done" ? "bg-[#0f7a52]" : w.kind === "booked" || w.kind === "approved" ? "bg-spark-blue" : "animate-pulse bg-spark-amber"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-spark-ink">{w.title}</p>
                    <p className="truncate text-[12.5px] text-spark-ink-muted">{[w.detail, w.at && when(w.at, data.timeZone)].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          {/* This week */}
          <div className="mt-3">
            {paid ? <Week data={data} onOpenDay={(label) => askSparklee(`Plan something for ${label} this week.`)} /> : (
              <LockedFeature compact feature="This week" body="See what's posted, booked and waiting on you each day with a SparkReels plan." />
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {/* Your Plan */}
            <Card title="Your Plan" link={{ href: "/settings/billing", label: "Billing" }}>
              {data.usage.unlimited ? <Empty>No limit on your account.</Empty> : (
                <>
                  <Meter label="Short videos left" value={`${data.usage.shortLeft}${data.usage.perMonth ? ` of ${data.usage.perMonth + data.usage.bought}` : ""}`}
                    pct={data.usage.perMonth ? (data.usage.shortLeft / (data.usage.perMonth + data.usage.bought)) * 100 : 0} />
                  <Meter label="AI images this month" value={`${data.usage.images.used} of ${data.usage.images.limit}`} pct={(data.usage.images.used / data.usage.images.limit) * 100} />
                  <p className="text-[13.5px] text-spark-ink-muted">AutoSparks drafts this month: <b className="text-spark-ink">{data.usage.autoSparksThisMonth}</b></p>
                  {data.usage.renewsAt && data.paid && (
                    <p className="mt-auto pt-2 text-[13px] text-spark-ink-muted">Renews {new Date(data.usage.renewsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  )}
                </>
              )}
              {!data.paid && <Link href="/settings/billing" className="mt-2 self-start rounded-lg bg-spark-amber px-3 py-1.5 text-[13.5px] font-bold text-white">See plans</Link>}
            </Card>

            {/* Quick Insights */}
            <Card title="Quick Insights" link={{ href: "/analytics", label: "Insights" }}>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                <Stat label="Views, last 30 days" value={data.insights.views === null ? "—" : data.insights.views.toLocaleString()} />
                <Stat label="Posts, last 7 days" value={String(data.insights.postsOut7)} />
                <Stat label="Accounts" value={String(data.connected.length)} />
              </div>
              {data.insights.topTitle ? (
                <p className="mt-auto rounded-lg bg-spark-amber-tint px-2.5 py-1.5 text-[13.5px]">✦ Top lately: <b>{data.insights.topTitle}</b>{data.insights.topViews ? ` · ${data.insights.topViews.toLocaleString()} views` : ""}</p>
              ) : (
                <p className="mt-auto text-[13px] text-spark-ink-muted">{data.insights.hasStats ? "No posts in the last 30 days." : "Numbers show once your posts have views."}</p>
              )}
            </Card>

            {/* What's New */}
            <Card title="What's New" link={{ href: "/whats-new", label: "All" }}>
              {data.whatsNew.map((w) => (
                <div key={w.id} className="border-t border-spark-rule py-1.5 first:border-t-0 first:pt-0">
                  <p className="text-[14.5px] font-semibold text-spark-ink">{w.title}</p>
                  <p className="line-clamp-1 text-[12.5px] text-spark-ink-muted">{w.description}</p>
                </div>
              ))}
            </Card>
          </div>

          {/* My Sparks */}
          <div className="mt-3">
            <Card title="My Sparks" link={{ href: "/videos", label: "See all" }}>
              {data.sparks.length === 0 && <Empty>Nothing yet. Ask Sparklee above, or make something yourself.</Empty>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {data.sparks.map((s) => (
                  <Link key={`${s.kind}-${s.id}`} href={s.href} className="overflow-hidden rounded-xl border border-spark-rule hover:border-spark-amber">
                    <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
                      {s.thumbUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : s.kind === "blog" ? <FileText size={20} className="text-slate-300" /> : <Film size={20} className="text-slate-300" />}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[13px] font-semibold text-spark-ink">{s.title}</p>
                      <p className="text-[11.5px] text-spark-ink-muted">{new Date(s.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {s.status}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {watch && watch.videoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setWatch(null)}>
          <div className="w-full max-w-3xl rounded-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-semibold">{watch.title}</p>
              <button type="button" onClick={() => setWatch(null)} aria-label="Close"><X size={18} /></button>
            </div>
            <video src={watch.videoUrl} controls autoPlay playsInline className={`mx-auto max-h-[70vh] rounded-lg bg-black ${watch.vertical ? "w-auto" : "w-full"}`} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] text-spark-ink-muted">Posts {when(watch.when, data?.timeZone)}{watch.platforms.length ? ` to ${watch.platforms.map((p) => LABEL[p] ?? p).join(", ")}` : ""}</span>
              <Link href="/autosparks" className="ml-auto rounded-lg border border-spark-rule px-3 py-1.5 text-[13.5px] font-semibold">Edit in AutoSparks</Link>
              <button type="button" disabled={approving === watch.id} onClick={() => void approve(watch)} className="flex items-center gap-1.5 rounded-lg bg-spark-amber px-3 py-1.5 text-[13.5px] font-bold text-white disabled:opacity-60">
                {approving === watch.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve to post
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({ url, vertical }: { url: string | null; vertical: boolean }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-[#3a2b17] to-[#BA7517] ${vertical ? "mx-[17px] h-[40px] w-[24px]" : "h-[34px] w-[58px]"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </div>
  );
}
function Meter({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div className="mb-2.5">
      <p className="mb-1 flex justify-between text-[13.5px]"><span className="text-spark-ink-soft">{label}</span><b>{value}</b></p>
      <div className="h-[7px] overflow-hidden rounded-full bg-[#eee9de]"><i className="block h-full rounded-full bg-spark-amber" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#faf9f5] px-2.5 py-2">
      <b className="block text-[19px] text-spark-ink">{value}</b>
      <span className="text-[11.5px] leading-tight text-spark-ink-muted">{label}</span>
    </div>
  );
}

function Week({ data, onOpenDay }: { data: HomeData; onOpenDay: (label: string) => void }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${data.week.start}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const style = { posted: "bg-[#e8f5ee] text-[#0f7a52]", booked: "bg-[#e7f0f6] text-spark-blue", needs: "border border-dashed border-[#e2c48d] bg-spark-amber-tint text-[#A3660F]" } as const;
  return (
    <Card title="This Week" link={{ href: "/calendar", label: "Calendar" }}>
      <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-spark-ink-muted">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#e8f5ee] align-[-1px]" />Posted</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#e7f0f6] align-[-1px]" />Booked</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-spark-amber-tint align-[-1px]" />Needs you</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#f4f2ee] align-[-1px]" />Open</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => {
          const d = new Date(`${day}T12:00:00Z`);
          const label = d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
          const items = data.week.items.filter((i) => i.day === day).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
          const past = day < data.week.today;
          return (
            <div key={day} className={`min-h-[96px] rounded-xl border p-1.5 ${day === data.week.today ? "border-spark-amber shadow-[0_0_0_2px_#fbeacc]" : "border-spark-rule"}`}>
              <p className="mb-1 text-[12.5px] font-semibold text-spark-ink-muted">{label.slice(0, 3)} <b className="text-[14px] text-spark-ink">{d.getUTCDate()}</b></p>
              {items.map((i, n) => (
                <Link key={n} href={i.state === "needs" ? "/autosparks" : "/calendar"} className={`mb-1 block rounded-md px-1.5 py-1 text-[12px] leading-tight ${style[i.state]}`}>
                  {i.state === "posted" && "✓ "}{i.at && i.state === "booked" ? `${new Date(i.at).toLocaleTimeString("en-US", { hour: "numeric", timeZone: data.timeZone })} · ` : ""}{i.title}
                </Link>
              ))}
              {items.length === 0 && !past && (
                <button type="button" onClick={() => onOpenDay(label)} className="block w-full rounded-md border border-dashed border-spark-rule bg-[#f4f2ee] px-1.5 py-1 text-left text-[12px] text-spark-ink-muted hover:border-spark-amber">+ Open</button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
