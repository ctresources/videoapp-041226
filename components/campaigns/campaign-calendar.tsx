"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText, Layers, PlayCircle, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";
import { addDays, browserTimeZone, dayKey, shortTime, weekdayOf, ymd } from "@/lib/utils/time-zone";
import {
  calendarItems,
  sparkProgress,
  type CalendarItem,
  type Campaign,
  type CampaignsPayload,
  type ItemStatus,
} from "@/lib/utils/campaigns";
import { SparkCard } from "@/components/campaigns/spark-card";
import { ITEM_STATUS_META, SPARK_STATUS_META, platformLabel } from "@/components/campaigns/status-meta";

type View = "month" | "week" | "list";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const STATUS_FILTERS: ItemStatus[] = [
  "draft", "ready", "scheduled_externally", "scheduled", "uploading", "processing", "published", "failed",
];

const BOOKED: ItemStatus[] = ["scheduled", "scheduled_externally", "uploading", "processing"];

// ── Day-key arithmetic (see lib/utils/time-zone.ts) ──────────────────────────

function monthStart(key: string, shift = 0): string {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + shift, 1));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
}

/** Every day shown for `key`'s month: whole weeks, Sunday to Saturday. */
function monthGrid(key: string): string[] {
  const first = monthStart(key);
  const [y, m] = first.split("-").map(Number);
  const last = ymd(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const end = addDays(last, 6 - weekdayOf(last));
  const days: string[] = [];
  for (let d = addDays(first, -weekdayOf(first)); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

function weekOf(key: string): string[] {
  const start = addDays(key, -weekdayOf(key));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function labelFor(key: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", { ...opts, timeZone: "UTC" });
}

const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
const dayNumber = (key: string) => Number(key.slice(8));

// ── Pieces ───────────────────────────────────────────────────────────────────

function KindIcon({ item }: { item: CalendarItem }) {
  const Icon = item.kind === "blog" ? FileText : item.platform === "youtube" ? PlayCircle : Layers;
  return <Icon size={10} className="shrink-0" />;
}

function ItemChip({ item, tz, wide, onOpen }: {
  item: CalendarItem; tz: string; wide?: boolean; onOpen: (campaignId: string) => void;
}) {
  const meta = ITEM_STATUS_META[item.status];
  return (
    <button
      type="button"
      onClick={() => onOpen(item.campaignId)}
      title={`${item.title} · ${platformLabel(item.platform)} · ${meta.label}`}
      className={cn("w-full rounded-md border px-1.5 py-1 text-left transition hover:brightness-[0.97]", meta.chip)}
    >
      <div className="flex items-center gap-1 text-[11px] font-medium leading-tight">
        <KindIcon item={item} />
        <span className="truncate">{item.title}</span>
      </div>
      <div className="mt-0.5 truncate text-[10px] opacity-75">
        {shortTime(new Date(item.at), tz)}
        {wide && ` · ${platformLabel(item.platform)} · ${meta.label}`}
      </div>
    </button>
  );
}

function SparkRow({ campaign: c, onOpen }: { campaign: Campaign; onOpen: () => void }) {
  const progress = sparkProgress(c);
  const status = SPARK_STATUS_META[progress.status];
  const lead = c.projects.find((p) => p.role === "primary") ?? c.projects[0];
  const kind = progress.hasVideo && progress.hasBlog ? "Video + Blog" : progress.hasBlog ? "Blog" : "Video";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-spark-paper/70"
      >
        {lead?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={lead.thumbnailUrl} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md bg-spark-paper">
            <PlayCircle size={14} className="text-spark-ink-faint" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[12.5px] font-medium leading-snug text-spark-ink">{c.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-spark-ink-faint">
            <span className={cn("rounded-full px-1.5 py-px font-medium", status.badge)}>{status.label}</span>
            {progress.total > 0 && progress.status !== "published" && (
              <span>{progress.ready} of {progress.total} ready</span>
            )}
            <span>· {kind}</span>
          </div>
        </div>
      </button>
    </li>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export function CampaignCalendar() {
  const { user } = useAuth();
  const [data, setData] = useState<CampaignsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tz, setTz] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [view, setView] = useState<View>("month");
  const [filters, setFilters] = useState({ campaign: "all", platform: "all", status: "all" });
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/campaigns", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't load your Sparks.");
      setData(body as CampaignsPayload);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load your Sparks.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * The zone every date is shown in: the saved one, else the browser's.
   *
   * The browser's guess is saved the first time, so a schedule set today and
   * read tomorrow on another device still means the same hour.
   */
  useEffect(() => {
    if (!data) return;
    if (data.timeZone) { setTz(data.timeZone); return; }
    const guess = browserTimeZone();
    setTz(guess);
    if (!user) return;
    createClient()
      .from("profiles")
      .update({ time_zone: guess })
      .eq("id", user.id)
      .then(({ error }) => {
        if (!error) setData((d) => (d ? { ...d, timeZone: guess } : d));
      });
  }, [data, user]);

  useEffect(() => {
    if (tz && !anchor) setAnchor(dayKey(new Date(), tz));
  }, [tz, anchor]);

  const campaigns = useMemo(() => data?.campaigns ?? [], [data]);
  const allItems = useMemo(() => campaigns.flatMap(calendarItems), [campaigns]);

  const platforms = useMemo(
    () => Array.from(new Set(["blog", "youtube", ...allItems.map((i) => i.platform)])),
    [allItems],
  );

  const items = useMemo(() => allItems.filter((i) =>
    (filters.campaign === "all" || i.campaignId === filters.campaign)
    && (filters.platform === "all" || i.platform === filters.platform)
    && (filters.status === "all" || i.status === filters.status)
  ), [allItems, filters]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    if (!tz) return map;
    for (const i of items) {
      const k = dayKey(new Date(i.at), tz);
      const list = map.get(k) ?? [];
      list.push(i);
      map.set(k, list);
    }
    map.forEach((list) => list.sort((a, b) => a.at.localeCompare(b.at)));
    return map;
  }, [items, tz]);

  const railCampaigns = useMemo(() => campaigns.filter((c) => {
    if (filters.campaign !== "all" && c.id !== filters.campaign) return false;
    if (filters.platform !== "all" && !calendarItems(c).some((i) => i.platform === filters.platform)) return false;
    if (filters.status !== "all") {
      const own = [c.blog.status, ...c.posts.map((p) => p.status)] as string[];
      if (!own.includes(filters.status) && sparkProgress(c).status !== filters.status) return false;
    }
    return true;
  }), [campaigns, filters]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-white/70" />
        <div className="h-[560px] animate-pulse rounded-2xl bg-white/70" />
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="font-medium text-spark-ink">{loadError}</p>
        <button onClick={load} className="mt-3 text-sm text-spark-amber underline">Try again</button>
      </div>
    );
  }

  if (!data || !tz || !anchor) return null;

  const today = dayKey(new Date(), tz);
  const grid = monthGrid(anchor);
  const week = weekOf(anchor);
  const rangeDays = view === "week" ? week : grid.filter((d) => sameMonth(d, anchor));
  const rangeLabel = view === "week"
    ? `${labelFor(week[0], { month: "short", day: "numeric" })} – ${labelFor(week[6], { month: "short", day: "numeric", year: "numeric" })}`
    : labelFor(monthStart(anchor), { month: "long", year: "numeric" });

  let publishedCount = 0;
  let bookedCount = 0;
  for (const d of rangeDays) {
    for (const i of byDay.get(d) ?? []) {
      if (i.status === "published") publishedCount++;
      else if (BOOKED.includes(i.status)) bookedCount++;
    }
  }

  const step = (dir: 1 | -1) =>
    setAnchor(view === "week" ? addDays(anchor, dir * 7) : monthStart(anchor, dir));

  const open = campaigns.find((c) => c.id === openId) ?? null;
  const selectCls = "rounded-lg border border-spark-rule bg-white px-2.5 py-1.5 text-xs text-spark-ink-soft focus:outline-none focus:ring-2 focus:ring-spark-amber/30";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-spark-ink">Spark Calendar</h1>
          <p className="mt-1 text-[13px] text-spark-ink-muted">
            {rangeLabel} · {publishedCount} published, {bookedCount} scheduled · times in {tz.replace(/_/g, " ")}{" "}
            <Link href="/settings" className="text-spark-amber hover:underline">change</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 rounded-lg border border-spark-rule bg-white p-0.5">
            {(["month", "week", "list"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition",
                  view === v ? "bg-spark-paper text-spark-ink" : "text-spark-ink-faint hover:text-spark-ink-muted",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            title="Refresh"
            className="rounded-lg border border-spark-rule bg-white p-2 text-spark-ink-faint transition hover:text-spark-ink-muted"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <Link href="/create" className="spark-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium">
            <Plus size={13} /> Create Spark
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="spark-eyebrow text-[9px]">FILTER</span>
        <select
          value={filters.campaign}
          onChange={(e) => setFilters((f) => ({ ...f, campaign: e.target.value }))}
          className={cn(selectCls, "max-w-[240px]")}
          aria-label="Spark"
        >
          <option value="all">All Sparks</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filters.platform}
          onChange={(e) => setFilters((f) => ({ ...f, platform: e.target.value }))}
          className={selectCls}
          aria-label="Platform"
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => <option key={p} value={p}>{platformLabel(p)}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className={selectCls}
          aria-label="Status"
        >
          <option value="all">All statuses</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{ITEM_STATUS_META[s].label}</option>)}
        </select>
        {(filters.campaign !== "all" || filters.platform !== "all" || filters.status !== "all") && (
          <button
            onClick={() => setFilters({ campaign: "all", platform: "all", status: "all" })}
            className="text-xs text-spark-ink-faint underline hover:text-spark-ink-muted"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* Calendar */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-spark-rule bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-spark-rule-soft px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-bold text-spark-ink">{rangeLabel}</span>
              <div className="flex gap-1">
                <button onClick={() => step(-1)} aria-label="Previous" className="flex h-6 w-6 items-center justify-center rounded-md border border-spark-rule text-spark-ink-muted hover:bg-spark-paper">
                  <ChevronLeft size={13} />
                </button>
                <button onClick={() => step(1)} aria-label="Next" className="flex h-6 w-6 items-center justify-center rounded-md border border-spark-rule text-spark-ink-muted hover:bg-spark-paper">
                  <ChevronRight size={13} />
                </button>
              </div>
              <button onClick={() => setAnchor(today)} className="text-[11px] font-medium text-spark-amber hover:underline">Today</button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(["published", "scheduled", "ready", "failed"] as ItemStatus[]).map((s) => (
                <span key={s} className="flex items-center gap-1.5 text-[10.5px] text-spark-ink-muted">
                  <span className={cn("h-[7px] w-[7px] rounded-sm", ITEM_STATUS_META[s].dot)} />
                  {s === "ready" ? "Draft or ready" : ITEM_STATUS_META[s].label}
                </span>
              ))}
            </div>
          </div>

          {view === "month" && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-7 border-l border-spark-rule-soft">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="border-b border-r border-spark-rule-soft bg-[#F4F2EC] px-2 py-1.5 font-mono text-[9px] tracking-[.11em] text-spark-ink-faint">
                    {d}
                  </div>
                ))}
                {grid.map((day) => {
                  const inMonth = sameMonth(day, anchor);
                  const isToday = day === today;
                  const dayItems = byDay.get(day) ?? [];
                  return (
                    <div
                      key={day}
                      className={cn(
                        "flex min-h-[104px] flex-col gap-1 border-b border-r border-spark-rule-soft p-1.5",
                        !inMonth && "bg-[#faf9f5]",
                        isToday && "bg-[#fffdf9]",
                      )}
                    >
                      {isToday ? (
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-spark-amber text-[10px] font-bold text-white">
                          {dayNumber(day)}
                        </span>
                      ) : (
                        <span className={cn("text-[11px] font-medium", inMonth ? "text-spark-ink-muted" : "text-[#c4c0b4]")}>
                          {dayNumber(day)}
                        </span>
                      )}
                      {dayItems.slice(0, 3).map((i) => (
                        <ItemChip key={i.key} item={i} tz={tz} onOpen={setOpenId} />
                      ))}
                      {dayItems.length > 3 && (
                        <button
                          onClick={() => { setAnchor(day); setView("week"); }}
                          className="pl-1 text-left text-[10px] text-spark-ink-faint hover:text-spark-ink-muted"
                        >
                          +{dayItems.length - 3} more
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "week" && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[700px] grid-cols-7 border-l border-spark-rule-soft">
                {week.map((day) => (
                  <div key={day} className="min-h-[380px] border-r border-spark-rule-soft">
                    <div className={cn("border-b border-spark-rule-soft px-2 py-2", day === today && "bg-[#fffdf9]")}>
                      <div className="font-mono text-[9px] tracking-[.11em] text-spark-ink-faint">{WEEKDAYS[weekdayOf(day)]}</div>
                      <div className={cn("text-sm font-semibold", day === today ? "text-spark-amber" : "text-spark-ink")}>
                        {dayNumber(day)}
                      </div>
                    </div>
                    <div className="space-y-1 p-1.5">
                      {(byDay.get(day) ?? []).map((i) => (
                        <ItemChip key={i.key} item={i} tz={tz} wide onOpen={setOpenId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "list" && (() => {
            const listDays = rangeDays.filter((d) => byDay.has(d));
            if (!listDays.length) {
              return <p className="px-4 py-16 text-center text-sm text-spark-ink-faint">Nothing is dated in {rangeLabel}.</p>;
            }
            return (
              <div className="divide-y divide-spark-rule-soft">
                {listDays.map((day) => (
                  <div key={day} className="px-4 py-3">
                    <div className="mb-1.5 font-mono text-[10px] tracking-[.11em] text-spark-ink-faint">
                      {labelFor(day, { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}
                      {day === today && " · TODAY"}
                    </div>
                    <div className="space-y-0.5">
                      {(byDay.get(day) ?? []).map((i) => {
                        const meta = ITEM_STATUS_META[i.status];
                        return (
                          <button
                            key={i.key}
                            onClick={() => setOpenId(i.campaignId)}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-spark-paper/60"
                          >
                            <span className="w-11 shrink-0 text-xs text-spark-ink-muted">{shortTime(new Date(i.at), tz)}</span>
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] text-spark-ink">{i.title}</span>
                              <span className="block truncate text-[11px] text-spark-ink-faint">
                                {i.kind === "blog" && i.status !== "published"
                                  ? "Blog · Manual publishing reminder"
                                  : platformLabel(i.platform)}{" "}
                                · {i.campaignName}
                              </span>
                            </span>
                            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.chip)}>
                              {meta.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Campaigns */}
        <aside className="w-full shrink-0 xl:w-[320px]">
          <div className="rounded-xl border border-spark-rule bg-white">
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
              <h2 className="text-[14px] font-bold text-spark-ink">My Sparks</h2>
              <span className="text-[11px] text-spark-ink-faint">{railCampaigns.length}</span>
            </div>
            {railCampaigns.length === 0 ? (
              <p className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-spark-ink-faint">
                {campaigns.length
                  ? "No Spark matches these filters."
                  : "Every great piece of content starts with a Spark. Each video you make from September on starts its own here."}
              </p>
            ) : (
              <ul className="max-h-[680px] overflow-y-auto px-2 pb-2">
                {railCampaigns.map((c) => (
                  <SparkRow key={c.id} campaign={c} onOpen={() => setOpenId(c.id)} />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {open && (
        <SparkCard
          campaign={open}
          allCampaigns={campaigns}
          timeZone={tz}
          youtubeChannel={data.youtubeChannel}
          onClose={() => setOpenId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
