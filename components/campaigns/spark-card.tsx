"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowDown, ArrowUp, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Copy,
  ExternalLink, Eye, FileText, Image as ImageIcon, Layers, Link2, Loader2, Pencil, PlayCircle, Plus,
  Radio, Sparkles, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { blogAsHtml } from "@/lib/utils/blog-html";
import { formatWhen, ymd, zonedParts, zonedToUtc } from "@/lib/utils/time-zone";
import {
  CAMPAIGN_ROLES,
  effectiveCta,
  isHttpUrl,
  leadVideo,
  sparkProgress,
  sparkSource,
  summarizeNeeds,
  videoLength,
  videoShape,
  videoState,
  type Campaign,
  type CampaignProject,
  type CampaignRole,
  type SparkCaptions,
  type SparkSeries,
} from "@/lib/utils/campaigns";
import {
  COMING_SOON_CHANNELS,
  ITEM_STATUS_META,
  SPARK_STATUS_META,
  VIDEO_STATE_META,
  platformLabel,
} from "@/components/campaigns/status-meta";

interface Props {
  campaign: Campaign;
  /** Every Spark, for Add Video to Spark and the Series strip. */
  allCampaigns: Campaign[];
  /** Every Series this user has. */
  series: SparkSeries[];
  timeZone: string;
  youtubeChannel: string | null;
  onClose: () => void;
  /** Open another Spark — a tile in the Series strip. */
  onOpenSpark: (id: string) => void;
  onSaved: () => Promise<void> | void;
}

type Sub = null | "preview" | "article" | "addVideo" | "review" | "series";
type Editing = null | "cta" | "captions" | "schedule" | "publish";

const STEPS = [
  "Start a New Spark",
  "Spark Blog or Video",
  "Choose Your Source",
  "Create and Customize",
  "Add to Spark Calendar",
  "Publish Your Spark",
  "Measure Your Spark",
];

const SITE_SUGGESTIONS = ["BoldTrail", "WordPress", "Squarespace", "Wix", "Webflow"];

const CAPTION_LIMITS: Record<keyof SparkCaptions, number> = {
  youtubeTitle: 100,
  youtubeDescription: 5000,
  instagramCaption: 2200,
};

const inputCls = "w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-[13px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber/30";
const labelCls = "mb-1 block text-[11px] font-medium text-spark-ink-muted";
const quietBtn = "inline-flex items-center gap-1.5 rounded-full border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink-soft transition hover:bg-spark-paper disabled:opacity-50";
const ctaBtn = "spark-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium disabled:opacity-50";
const pill = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-medium";

const pad = (n: number) => String(n).padStart(2, "0");

/** A saved instant as date and time inputs in the user's zone. */
function toInputs(iso: string | null, tz: string, fallbackNow = false): { date: string; time: string } {
  if (!iso && !fallbackNow) return { date: "", time: "09:00" };
  const p = zonedParts(iso ? new Date(iso) : new Date(), tz);
  return { date: ymd(p.year, p.month, p.day), time: `${pad(p.hour)}:${pad(p.minute)}` };
}

async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
  return data;
}

function Section({ icon: Icon, title, note, actions, children }: {
  icon: React.ElementType; title: string; note?: string; actions?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="border-t border-spark-rule-soft px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-spark-ink">
          <Icon size={14} className="text-spark-amber" />
          {title}
          {note && <span className="text-[11px] font-normal text-spark-ink-faint">{note}</span>}
        </h3>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** How a channel publishes — the one thing the Spark Card must never leave ambiguous. */
function MethodPill({ kind }: { kind: "auto" | "manual" | "soon" }) {
  if (kind === "auto") return <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>Publishes automatically</span>;
  if (kind === "manual") return <span className={cn(pill, "border-spark-blue/20 bg-spark-blue/10 text-spark-blue")}>You publish it</span>;
  return <span className={cn(pill, "border-dashed border-spark-rule bg-white text-spark-ink-faint")}>Coming soon</span>;
}

function SubPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-spark-rule px-5 py-3.5">
        <h3 className="text-[14px] font-semibold text-spark-ink">{title}</h3>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-spark-ink-faint hover:bg-spark-paper">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
    </div>
  );
}

export function SparkCard({ campaign: c, allCampaigns, series, timeZone: tz, youtubeChannel, onClose, onOpenSpark, onSaved }: Props) {
  const mySeries = series.find((s) => s.id === c.seriesId) ?? null;
  const ctx = { youtubeConnected: !!youtubeChannel, series: mySeries };
  const progress = sparkProgress(c, ctx);
  const optionalNeeds = progress.setup.needs.filter((n) => !n.blocking);
  // What the Spark actually uses: its own CTA and link, else the Series'.
  const shownCta = effectiveCta(c, mySeries);

  // The Sparks in this Series, in their running order.
  const seriesSparks = mySeries
    ? allCampaigns
      .filter((x) => x.seriesId === mySeries.id)
      .sort((a, b) => (a.seriesPosition ?? 0) - (b.seriesPosition ?? 0) || a.createdAt.localeCompare(b.createdAt))
    : [];
  const myIndex = seriesSparks.findIndex((x) => x.id === c.id);
  const lead = c.projects.find((p) => p.role === "primary") ?? c.projects[0];

  const [selectedId, setSelectedId] = useState<string | null>(lead?.id ?? null);
  const selected: CampaignProject | undefined = c.projects.find((p) => p.id === selectedId) ?? lead;

  const [sub, setSub] = useState<Sub>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [stepView, setStepView] = useState(progress.step);

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(c.name);
  const [cta, setCta] = useState(c.ctaText ?? "");
  const [dest, setDest] = useState(c.destinationUrl ?? "");
  const [caps, setCaps] = useState<SparkCaptions>(selected?.captions ?? { youtubeTitle: "", youtubeDescription: "", instagramCaption: "" });
  const [reminder, setReminder] = useState(() => toInputs(c.blog.plannedAt, tz));
  const [externally, setExternally] = useState(c.blog.status === "scheduled_externally");
  const [pub, setPub] = useState({ url: "", site: "", date: "", time: "" });
  const [article, setArticle] = useState({ title: "", intro: "", body: "", conclusion: "" });
  const [previewHtml, setPreviewHtml] = useState("");
  const [addRole, setAddRole] = useState<CampaignRole>("short_variation");
  const [scheduling, setScheduling] = useState<{ projectId: string; date: string; time: string } | null>(null);
  const [planName, setPlanName] = useState("");
  const [newSeriesName, setNewSeriesName] = useState("");
  const [seriesName, setSeriesName] = useState(mySeries?.name ?? "");
  const [seriesCta, setSeriesCta] = useState({ text: mySeries?.ctaText ?? "", url: mySeries?.destinationUrl ?? "" });

  // Re-seed from the saved Spark whenever a save brings back fresh values.
  useEffect(() => {
    setName(c.name);
    setCta(c.ctaText ?? "");
    setDest(c.destinationUrl ?? "");
    setReminder(toInputs(c.blog.plannedAt, tz));
    setExternally(c.blog.status === "scheduled_externally");
    const s = series.find((x) => x.id === c.seriesId) ?? null;
    setStepView(sparkProgress(c, { youtubeConnected: !!youtubeChannel, series: s }).step);
    setSeriesName(s?.name ?? "");
    setSeriesCta({ text: s?.ctaText ?? "", url: s?.destinationUrl ?? "" });
  }, [c, tz, youtubeChannel, series]);

  useEffect(() => {
    if (selected) setCaps(selected.captions);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sub) setSub(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sub]);

  const when = (iso: string) => formatWhen(new Date(iso), tz);
  const status = SPARK_STATUS_META[progress.status];
  const kind = progress.hasVideo && progress.hasBlog ? "Video + Blog" : progress.hasBlog ? "Blog" : "Video";
  const blogPublished = c.blog.status === "published";
  const blogReady = c.blog.hasArticle || c.blog.status !== "draft";
  const blogState = blogPublished ? "published" : c.blog.status === "scheduled_externally" ? "scheduled_externally" : blogReady ? "ready" : "draft";
  const blogLabel = blogPublished ? "Published" : blogState === "scheduled_externally" ? "Scheduled externally" : blogReady ? "Ready" : "Not written yet";
  const roleLabel = (p: CampaignProject) => (p.role ? CAMPAIGN_ROLES[p.role] : "No role yet");
  const selectedVideo = selected ? leadVideo(selected) : null;
  const playable = selectedVideo?.renderStatus === "completed" && selectedVideo.videoUrl ? selectedVideo : null;

  async function act(key: string, fn: () => Promise<unknown>, done: string, after?: () => void) {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      after?.();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const patchSpark = (fields: Record<string, unknown>) => send("/api/campaigns", "PATCH", { id: c.id, ...fields });
  const patchVideo = (fields: Record<string, unknown>) => send("/api/campaigns/project", "PATCH", fields);
  const postSeries = (fields: Record<string, unknown>) => send("/api/campaigns/series", "POST", fields);

  function saveName() {
    const next = name.trim();
    setEditingName(false);
    if (next === c.name) return;
    if (!next) { setName(c.name); toast.error("A Spark needs a name."); return; }
    act("name", () => patchSpark({ name: next }), "Spark renamed.");
  }

  function saveCta() {
    const link = dest.trim();
    if (link && !isHttpUrl(link)) { toast.error("The destination link must be a full web address, starting with https://"); return; }
    act("cta", () => patchSpark({ cta_text: cta, destination_url: link || null }), "CTA saved.", () => setEditing(null));
  }

  function saveCaptions() {
    if (!selected) return;
    for (const [k, max] of Object.entries(CAPTION_LIMITS) as [keyof SparkCaptions, number][]) {
      if (caps[k].length > max) { toast.error(`That caption is over the ${max}-character limit.`); return; }
    }
    act("captions", () => patchVideo({
      action: "captions",
      projectId: selected.id,
      youtube_title: caps.youtubeTitle,
      youtube_description: caps.youtubeDescription,
      instagram_caption: caps.instagramCaption,
    }), "Captions saved.", () => setEditing(null));
  }

  function saveSchedule() {
    const planned = reminder.date ? zonedToUtc(reminder.date, reminder.time || "09:00", tz).toISOString() : null;
    const fields: Record<string, unknown> = { blog_planned_at: planned };
    if (!blogPublished) fields.blog_status = externally ? "scheduled_externally" : blogReady ? "ready" : "draft";
    act("schedule", () => patchSpark(fields), "Schedule saved.", () => setEditing(null));
  }

  function openPublish() {
    const now = toInputs(null, tz, true);
    setPub({ url: c.blog.url ?? "", site: c.blog.platform ?? "", date: now.date, time: now.time });
    setEditing("publish");
  }

  function confirmPublished() {
    const url = pub.url.trim();
    if (!isHttpUrl(url)) { toast.error("Add the published URL — the full address, starting with https://"); return; }
    if (!pub.date) { toast.error("Add the date the article went live."); return; }
    if (!pub.site.trim()) { toast.error("Add the website or CRM it's published on."); return; }
    act("publish", () => patchSpark({
      blog_status: "published",
      blog_url: url,
      blog_platform: pub.site.trim(),
      blog_published_at: zonedToUtc(pub.date, pub.time || "09:00", tz).toISOString(),
    }), "Article marked as published.", () => setEditing(null));
  }

  function unpublish() {
    act("publish", () => patchSpark({ blog_status: "ready" }), "Article moved back to Ready.");
  }

  async function loadArticle(): Promise<{ intro: string; body: string; conclusion: string } | null> {
    try {
      const data = await send(`/api/campaigns/blog?campaignId=${encodeURIComponent(c.id)}`, "GET");
      return data.blog as { intro: string; body: string; conclusion: string };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the article.");
      return null;
    }
  }

  async function copyHtml() {
    setBusy("copy");
    const blog = await loadArticle();
    if (blog) {
      await navigator.clipboard.writeText(blogAsHtml(blog));
      toast.success("Blog HTML copied. Paste it into your website or CRM's HTML view.");
    }
    setBusy(null);
  }

  async function openPreview() {
    setBusy("preview");
    const blog = await loadArticle();
    if (blog) { setPreviewHtml(blogAsHtml(blog)); setSub("preview"); }
    setBusy(null);
  }

  async function openArticle() {
    setBusy("article-load");
    const blog = await loadArticle();
    if (blog) { setArticle({ title: c.blog.title ?? "", ...blog }); setSub("article"); }
    setBusy(null);
  }

  function saveArticle() {
    const projectId = c.blog.projectId;
    if (!projectId) return;
    if (!article.body.trim()) { toast.error("The article body can't be empty."); return; }
    act("article", async () => {
      await patchVideo({ action: "article", projectId, intro: article.intro, body: article.body, conclusion: article.conclusion });
      if (article.title.trim() !== (c.blog.title ?? "")) await patchSpark({ blog_title: article.title });
    }, "Article saved.", () => setSub(null));
  }

  function sparkBlog() {
    const projectId = c.blog.projectId;
    if (!projectId) return;
    act("spark-blog", () => send("/api/ai/blog", "POST", { projectId }), "Article written. Preview it, then Copy as HTML.");
  }

  function setRole(projectId: string, role: CampaignRole) {
    act(`role-${projectId}`, () => patchVideo({ action: "role", projectId, role }), "Role updated.");
  }

  /**
   * Publish to YouTube, now or at a time.
   *
   * The same route the Publish window uses, with the captions shown on this
   * card — so what you read here is what goes out. A time is handed to
   * YouTube, which holds the video and makes it public itself.
   */
  function publish(p: CampaignProject, whenIso: string | null) {
    const v = leadVideo(p);
    if (!v?.videoUrl || v.renderStatus !== "completed") {
      toast.error("That video hasn't finished rendering yet.");
      return;
    }
    if (!youtubeChannel) {
      toast.error("Connect your YouTube channel first, in Settings → Social Accounts.");
      return;
    }
    const title = p.captions.youtubeTitle.trim() || p.title;
    const already = c.posts.filter((x) => x.projectId === p.id && x.platform === "youtube" && x.status !== "failed");
    const warning = already.length
      ? `This video is already on YouTube (${already.map((x) => ITEM_STATUS_META[x.status].label.toLowerCase()).join(", ")}). Post it again?\n\n`
      : "";
    const question = whenIso
      ? `${warning}Schedule “${title}” on ${youtubeChannel} for ${formatWhen(new Date(whenIso), tz)}?`
      : `${warning}Publish “${title}” to ${youtubeChannel} now? It goes public immediately.`;
    if (!window.confirm(question)) return;

    act(`publish-${p.id}`, () => send("/api/social/post", "POST", {
      videoId: v.id,
      scheduledAt: whenIso,
      targets: [{
        accountId: "native_youtube",
        platform: "youtube",
        source: "native",
        title,
        description: p.captions.youtubeDescription,
        privacy: "public",
      }],
    }), whenIso ? "Scheduled on YouTube." : "Published to YouTube.", () => setScheduling(null));
  }

  /**
   * Cancel a scheduled upload. YouTube is already holding the video, so this
   * asks YouTube to delete it — and if YouTube refuses, its reason is shown
   * rather than a cheerful "cancelled".
   */
  function cancelScheduled(postId: string) {
    if (!window.confirm("Cancel this scheduled post? The video is removed from YouTube, where it is waiting privately.")) return;
    act(`cancel-${postId}`, () => send("/api/social/schedule", "DELETE", { postId }), "Scheduled post cancelled.");
  }

  function createSeries() {
    const name = newSeriesName.trim();
    if (!name) { toast.error("Give the Series a name."); return; }
    act("series", () => postSeries({ action: "create", name, sparkId: c.id }), "Series started.", () => { setNewSeriesName(""); setSub(null); });
  }

  function joinSeries(seriesId: string) {
    act("series", () => postSeries({ action: "move", sparkId: c.id, seriesId }), "Added to the Series.", () => setSub(null));
  }

  function leaveSeries() {
    act("series", () => postSeries({ action: "move", sparkId: c.id, seriesId: null }), "Taken out of the Series. Its CTA and link stayed with this Spark.", () => setSub(null));
  }

  function renameSeries() {
    if (!mySeries) return;
    const name = seriesName.trim();
    if (!name || name === mySeries.name) return;
    act("series", () => postSeries({ action: "rename", seriesId: mySeries.id, name }), "Series renamed.");
  }

  function saveSeriesDefaults() {
    if (!mySeries) return;
    const url = seriesCta.url.trim();
    if (url && !isHttpUrl(url)) { toast.error("The destination link must be a full web address, starting with https://"); return; }
    act("series", () => postSeries({ action: "defaults", seriesId: mySeries.id, cta_text: seriesCta.text, destination_url: url || null }), "Series defaults saved.");
  }

  function deleteSeries() {
    if (!mySeries) return;
    act("series", () => postSeries({ action: "delete", seriesId: mySeries.id }), "Series deleted. Every Spark kept its CTA and link.", () => setSub(null));
  }

  function planSpark() {
    if (!mySeries) return;
    const name = planName.trim();
    if (!name) { toast.error("Give the Spark a name."); return; }
    act("plan", () => postSeries({ action: "plan", seriesId: mySeries.id, name }), "Planned Spark added.", () => setPlanName(""));
  }

  function reorder(index: number, dir: -1 | 1) {
    if (!mySeries) return;
    const next = [...seriesSparks];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    act("reorder", () => postSeries({ action: "reorder", seriesId: mySeries.id, order: next.map((x) => x.id) }), "Order saved.");
  }

  function attach(projectId: string) {
    act(`attach-${projectId}`, () => patchVideo({ action: "attach", projectId, campaignId: c.id, role: addRole }), "Video added to this Spark.", () => setSub(null));
  }

  const candidates = allCampaigns
    .filter((x) => x.id !== c.id)
    .flatMap((x) => x.projects.map((p) => ({ spark: x, project: p })));

  const youtubeRows = c.projects.map((p) => {
    const posts = c.posts.filter((x) => x.projectId === p.id && x.platform === "youtube");
    const published = posts.find((x) => x.status === "published");
    const booked = posts.find((x) => x.status === "scheduled" || x.status === "uploading" || x.status === "processing");
    return { project: p, published, booked, state: videoState(c, p) };
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={c.name}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full w-full max-w-[560px] flex-col bg-[#fffdf9] shadow-brand-lg"
      >
        <div className="flex-1 overflow-y-auto">
          {/* ── Header ── */}
          <div className="border-b border-spark-rule bg-white px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="spark-eyebrow text-[9px]">SPARK CARD</span>
                  {mySeries && (
                    <button
                      type="button"
                      onClick={() => setSub("series")}
                      className="inline-flex items-center gap-1 text-[10.5px] text-spark-ink-muted hover:text-spark-amber"
                    >
                      <Layers size={11} />
                      Spark Series: {mySeries.name} · Spark {myIndex + 1} of {seriesSparks.length}
                    </button>
                  )}
                </div>
                {editingName ? (
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={saveName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") { e.stopPropagation(); setName(c.name); setEditingName(false); }
                    }}
                    aria-label="Spark name"
                    className="mt-1 w-full rounded border border-spark-rule px-2 py-1 text-[17px] font-bold text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber/30"
                  />
                ) : (
                  <div className="mt-1 flex items-start gap-2">
                    <h2 className="text-[17px] font-bold leading-snug text-spark-ink">{c.name}</h2>
                    <button onClick={() => setEditingName(true)} aria-label="Rename Spark" className="mt-0.5 rounded p-1 text-spark-ink-faint hover:bg-spark-paper hover:text-spark-amber">
                      {busy === "name" ? <Loader2 size={13} className="animate-spin" /> : <Pencil size={13} />}
                    </button>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", status.badge)}>
                    Status: {status.label}
                  </span>
                  <span className={cn(pill, "border-spark-rule bg-white text-spark-ink-muted")}>{kind}</span>
                  <span className={cn(pill, "border-spark-rule bg-white text-spark-ink-muted")}>Source: {sparkSource(lead)}</span>
                </div>
                {/* Two measures, kept apart: content is what was made; setup is
                    what it needs to go out. Captions never enter the count. */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                  <span className="text-spark-ink-soft">
                    Content ready: <span className="font-semibold text-spark-ink">{progress.contentReady} of {progress.contentTotal}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSub("review")}
                    className={cn("text-left hover:underline", progress.setup.blocking ? "text-[#8D580F]" : "text-emerald-700")}
                  >
                    Publishing setup: <span className="font-semibold">{progress.setup.summary}</span>
                  </button>
                </div>
                {optionalNeeds.length > 0 && (
                  <p className="mt-1 text-[11px] text-spark-ink-faint">
                    Not holding it back: {summarizeNeeds(optionalNeeds)}, for when Instagram can publish.
                  </p>
                )}
              </div>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-spark-ink-faint hover:bg-spark-paper">
                <X size={16} />
              </button>
            </div>

            {/* The seven steps: all of them on wider screens, one at a time on phones. */}
            <ol className="mt-4 hidden gap-1 sm:flex">
              {STEPS.map((label, i) => {
                const n = i + 1;
                const done = n < progress.step;
                const current = n === progress.step;
                return (
                  <li key={label} className="min-w-0 flex-1 text-center">
                    <div
                      className={cn(
                        "mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                        done && "bg-spark-amber text-white",
                        current && "border-2 border-spark-amber text-spark-amber",
                        !done && !current && "border border-spark-rule-dim text-spark-ink-faint",
                      )}
                    >
                      {done ? "✓" : n}
                    </div>
                    <div className={cn("text-[10px] leading-tight", current ? "font-semibold text-spark-ink" : "text-spark-ink-faint")}>{label}</div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-spark-rule px-2 py-2 sm:hidden">
              <button onClick={() => setStepView((s) => Math.max(1, s - 1))} aria-label="Previous step" className="rounded-lg p-1.5 text-spark-ink-muted hover:bg-spark-paper">
                <ChevronLeft size={15} />
              </button>
              <div className="flex-1 text-center">
                <div className="text-[11px] text-spark-ink-faint">Step {stepView} of 7{stepView === progress.step ? " · You are here" : ""}</div>
                <div className="text-[13px] font-semibold text-spark-ink">{STEPS[stepView - 1]}</div>
              </div>
              <button onClick={() => setStepView((s) => Math.min(7, s + 1))} aria-label="Next step" className="rounded-lg p-1.5 text-spark-ink-muted hover:bg-spark-paper">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* ── Videos ── */}
          <Section
            icon={PlayCircle}
            title="Videos"
            actions={
              <button onClick={() => setSub("addVideo")} className={quietBtn}>
                <Plus size={12} /> Add Video to Spark
              </button>
            }
          >
            {playable ? (
              // The thumbnail as poster, and #t= so iOS has a first frame even without one.
              <video
                key={playable.id}
                src={`${playable.videoUrl}#t=0.1`}
                poster={selected?.thumbnailUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="mb-3 aspect-video w-full rounded-lg bg-black object-contain"
              />
            ) : selected?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.thumbnailUrl} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
            ) : (
              <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-spark-paper text-[12px] text-spark-ink-faint">
                {selectedVideo ? "This video is still rendering." : "No video made yet."}
              </div>
            )}

            <ul className="space-y-1">
              {c.projects.map((p) => {
                const v = leadVideo(p);
                const state = VIDEO_STATE_META[videoState(c, p)];
                const meta = [videoShape(v?.videoType), videoLength(v?.durationSeconds)].filter(Boolean).join(" · ");
                const isSelected = p.id === selected?.id;
                return (
                  <li
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition",
                      isSelected ? "border-spark-amber/50 bg-spark-amber-tint/60" : "border-transparent hover:bg-spark-paper/60",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <select
                        value={p.role ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRole(p.id, e.target.value as CampaignRole)}
                        aria-label="Role in this Spark"
                        className="-ml-1 max-w-full rounded bg-transparent px-1 text-[12.5px] font-medium text-spark-ink hover:bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber/30"
                      >
                        {!p.role && <option value="">No role yet</option>}
                        {(Object.keys(CAMPAIGN_ROLES) as CampaignRole[]).map((r) => (
                          <option key={r} value={r}>{CAMPAIGN_ROLES[r]}</option>
                        ))}
                      </select>
                      <div className="truncate text-[11px] text-spark-ink-faint">{p.title}</div>
                    </div>
                    {meta && <span className="shrink-0 text-[11px] text-spark-ink-muted">{meta}</span>}
                    <span className={cn(pill, "shrink-0", state.chip)}>{state.label}</span>
                    <Link
                      href={`/create/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-[11px] font-medium text-spark-amber hover:underline"
                    >
                      Edit
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>

          {/* ── Blog article ── */}
          <Section
            icon={FileText}
            title="Blog Article"
            actions={c.blog.hasArticle ? (
              <>
                <button onClick={openPreview} disabled={busy !== null} className={quietBtn}>
                  {busy === "preview" ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Preview Article
                </button>
                <button onClick={openArticle} disabled={busy !== null} className={quietBtn}>
                  {busy === "article-load" ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />} Edit Article
                </button>
              </>
            ) : c.blog.projectId ? (
              <button onClick={sparkBlog} disabled={busy !== null} className={ctaBtn}>
                {busy === "spark-blog" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Spark Blog
              </button>
            ) : null}
          >
            <div className="text-[13px] font-medium text-spark-ink">{c.blog.title || c.name}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={cn(pill, ITEM_STATUS_META[blogState].chip)}>{blogLabel}</span>
              <span className={cn(pill, "border-spark-rule bg-white text-spark-ink-muted")}>{c.blog.platform || "Website or CRM"}</span>
              <span className={cn(pill, "border-spark-blue/20 bg-spark-blue/10 text-spark-blue")}>Publishing method: Copy as HTML</span>
            </div>

            {!c.blog.hasArticle && (
              <p className="mt-2 text-[12px] text-spark-ink-faint">
                {c.blog.projectId
                  ? "Spark Blog writes a full article from this Spark's script. It's free."
                  : "This Spark has no article linked yet."}
              </p>
            )}

            {c.blog.hasArticle && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <button onClick={copyHtml} disabled={busy !== null} className={quietBtn}>
                  {busy === "copy" ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Copy as HTML
                </button>
                {blogPublished ? (
                  <button onClick={unpublish} disabled={busy !== null} className={quietBtn}>
                    {busy === "publish" && <Loader2 size={12} className="animate-spin" />} Mark as not published
                  </button>
                ) : editing !== "publish" && (
                  <button onClick={openPublish} disabled={busy !== null} className={quietBtn}>
                    <CheckCircle2 size={12} /> Mark as Published
                  </button>
                )}
              </div>
            )}

            {blogPublished && c.blog.publishedAt && (
              <p className="mt-3 text-[12px] text-spark-ink-muted">
                Published {when(c.blog.publishedAt)}{c.blog.platform ? ` on ${c.blog.platform}` : ""}
                {c.blog.url && (
                  <>
                    {" · "}
                    <a href={c.blog.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-spark-amber hover:underline">
                      View <ExternalLink size={10} />
                    </a>
                  </>
                )}
              </p>
            )}

            {editing === "publish" && (
              <div className="mt-3 space-y-2.5 rounded-xl border border-spark-rule bg-white p-3">
                <p className="text-[12px] text-spark-ink-muted">You published this yourself, so tell SparkReels where and when.</p>
                <div>
                  <label className={labelCls} htmlFor="pub-url">Published URL</label>
                  <input id="pub-url" type="url" value={pub.url} onChange={(e) => setPub({ ...pub, url: e.target.value })} placeholder="https://yoursite.com/blog/…" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pub-date">Actual publication date</label>
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <input id="pub-date" type="date" value={pub.date} onChange={(e) => setPub({ ...pub, date: e.target.value })} className={inputCls} />
                    <input type="time" value={pub.time} onChange={(e) => setPub({ ...pub, time: e.target.value })} aria-label="Publication time" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls} htmlFor="pub-site">Website or CRM name</label>
                  <input id="pub-site" list="spark-site-suggestions" value={pub.site} onChange={(e) => setPub({ ...pub, site: e.target.value })} placeholder="The site or CRM it's on" className={inputCls} />
                  <datalist id="spark-site-suggestions">
                    {SITE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setEditing(null)} className={quietBtn}>Cancel</button>
                  <button onClick={confirmPublished} disabled={busy !== null} className={ctaBtn}>
                    {busy === "publish" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Mark as Published
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* ── CTA and destination ── */}
          <Section
            icon={Link2}
            title="CTA and Destination"
            actions={editing !== "cta" && (
              <button onClick={() => setEditing("cta")} className={quietBtn}><Pencil size={12} /> Edit CTA</button>
            )}
          >
            {editing === "cta" ? (
              <div className="space-y-2.5">
                <div>
                  <label className={labelCls} htmlFor="spark-cta">CTA</label>
                  <textarea id="spark-cta" rows={2} value={cta} onChange={(e) => setCta(e.target.value)} placeholder={lead?.cta ? `From the script: ${lead.cta}` : "What should viewers do next?"} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="spark-dest">Destination link</label>
                  <input id="spark-dest" type="url" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="https://" className={inputCls} />
                </div>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => { setCta(c.ctaText ?? ""); setDest(c.destinationUrl ?? ""); setEditing(null); }} className={quietBtn}>Cancel</button>
                  <button onClick={saveCta} disabled={busy !== null} className={ctaBtn}>
                    {busy === "cta" && <Loader2 size={12} className="animate-spin" />} Save CTA
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-[13px] text-spark-ink">
                  {shownCta.text || (lead?.cta ? <span className="text-spark-ink-muted">From the script: {lead.cta}</span> : <span className="text-spark-ink-faint">No CTA yet</span>)}
                </div>
                {shownCta.url ? (
                  <a href={shownCta.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-block break-all text-[12px] text-spark-amber hover:underline">
                    {shownCta.url}
                  </a>
                ) : (
                  <div className="mt-0.5 text-[12px] text-spark-ink-faint">No destination link yet</div>
                )}
                {shownCta.inherited && mySeries && (
                  <p className="mt-1 text-[11px] text-spark-ink-faint">Inherited from the Series “{mySeries.name}”. Editing here sets this Spark&apos;s own.</p>
                )}
              </>
            )}
          </Section>

          {/* ── Thumbnail and captions (for the selected video) ── */}
          {selected && (
            <Section
              icon={ImageIcon}
              title="Thumbnail and Captions"
              note={`for ${roleLabel(selected)}`}
              actions={editing !== "captions" && (
                <>
                  <Link href={`/create/${selected.id}`} className={quietBtn}><ImageIcon size={12} /> Change Thumbnail</Link>
                  <button onClick={() => setEditing("captions")} className={quietBtn}><Pencil size={12} /> Edit Captions</button>
                </>
              )}
            >
              {editing === "captions" ? (
                <div className="space-y-2.5">
                  {([
                    ["youtubeTitle", "YouTube title", 1],
                    ["youtubeDescription", "YouTube description", 5],
                    ["instagramCaption", "Instagram caption", 4],
                  ] as [keyof SparkCaptions, string, number][]).map(([key, label, rows]) => (
                    <div key={key}>
                      <div className="flex items-baseline justify-between">
                        <label className={labelCls} htmlFor={`cap-${key}`}>{label}</label>
                        <span className={cn("text-[10.5px]", caps[key].length > CAPTION_LIMITS[key] ? "text-red-600" : "text-spark-ink-faint")}>
                          {caps[key].length}/{CAPTION_LIMITS[key]}
                        </span>
                      </div>
                      {rows === 1 ? (
                        <input id={`cap-${key}`} value={caps[key]} onChange={(e) => setCaps({ ...caps, [key]: e.target.value })} className={inputCls} />
                      ) : (
                        <textarea id={`cap-${key}`} rows={rows} value={caps[key]} onChange={(e) => setCaps({ ...caps, [key]: e.target.value })} className={inputCls} />
                      )}
                    </div>
                  ))}
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => { setCaps(selected.captions); setEditing(null); }} className={quietBtn}>Cancel</button>
                    <button onClick={saveCaptions} disabled={busy !== null} className={ctaBtn}>
                      {busy === "captions" && <Loader2 size={12} className="animate-spin" />} Save Captions
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  {selected.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.thumbnailUrl} alt="" className="h-16 w-28 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md bg-spark-paper text-[10.5px] text-spark-ink-faint">No thumbnail</div>
                  )}
                  <ul className="min-w-0 flex-1 space-y-1">
                    {([
                      ["YouTube title", selected.captions.youtubeTitle],
                      ["YouTube description", selected.captions.youtubeDescription],
                      ["Instagram caption", selected.captions.instagramCaption],
                    ] as [string, string][]).map(([label, value]) => (
                      <li key={label} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-spark-ink-soft">{label}</span>
                        <span className={cn(pill, value.trim() ? ITEM_STATUS_META.ready.chip : "border-dashed border-spark-rule bg-white text-spark-ink-faint")}>
                          {value.trim() ? "Written" : "Waiting"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* ── Channels and schedule ── */}
          <Section
            icon={CalendarDays}
            title="Channels and Schedule"
            actions={editing !== "schedule" && (
              <button onClick={() => setEditing("schedule")} className={quietBtn}><Pencil size={12} /> Edit Schedule</button>
            )}
          >
            {editing === "schedule" && (
              <div className="mb-3 space-y-2.5 rounded-xl border border-spark-rule bg-white p-3">
                <div>
                  <label className={labelCls} htmlFor="reminder-date">Blog · manual publishing reminder</label>
                  <div className="grid grid-cols-[1fr_120px] gap-2">
                    <input id="reminder-date" type="date" value={reminder.date} onChange={(e) => setReminder({ ...reminder, date: e.target.value })} className={inputCls} />
                    <input type="time" value={reminder.time} onChange={(e) => setReminder({ ...reminder, time: e.target.value })} aria-label="Reminder time" className={inputCls} />
                  </div>
                </div>
                {!blogPublished && (
                  <label className="flex items-center gap-2 text-[12px] text-spark-ink-soft">
                    <input type="checkbox" checked={externally} onChange={(e) => setExternally(e.target.checked)} />
                    I&apos;ve already scheduled it in my website or CRM
                  </label>
                )}
                <p className="text-[11px] text-spark-ink-faint">
                  SparkReels won&apos;t publish the article. This date is a reminder to publish it yourself.
                  Videos are different: Publish now and Schedule above send them to YouTube.
                </p>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => { setReminder(toInputs(c.blog.plannedAt, tz)); setExternally(c.blog.status === "scheduled_externally"); setEditing(null); }} className={quietBtn}>Cancel</button>
                  <button onClick={saveSchedule} disabled={busy !== null} className={ctaBtn}>
                    {busy === "schedule" && <Loader2 size={12} className="animate-spin" />} Save Schedule
                  </button>
                </div>
              </div>
            )}

            <ul className="divide-y divide-spark-rule-soft">
              {youtubeRows.map(({ project: p, published, booked, state }) => {
                const v = leadVideo(p);
                const canSend = !!v?.videoUrl && v.renderStatus === "completed" && !published;
                const form = scheduling?.projectId === p.id ? scheduling : null;
                return (
                  <li key={p.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <PlayCircle size={14} className="shrink-0 text-spark-ink-faint" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-spark-ink">YouTube · {roleLabel(p)}</div>
                        <div className="text-[11px] text-spark-ink-faint">
                          {published?.at ? `Published ${when(published.at)}`
                            : booked?.at ? `Goes public ${when(booked.at)}`
                            : youtubeChannel ? "Not scheduled yet" : "YouTube not connected"}
                          {published?.url && (
                            <>
                              {" · "}
                              <a href={published.url} target="_blank" rel="noopener noreferrer" className="text-spark-amber hover:underline">View</a>
                            </>
                          )}
                        </div>
                      </div>
                      <MethodPill kind="auto" />
                      <span className={cn(pill, VIDEO_STATE_META[state].chip)}>{VIDEO_STATE_META[state].label}</span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
                      {canSend && !form && (
                        <>
                          <button onClick={() => publish(p, null)} disabled={busy !== null} className={quietBtn}>
                            {busy === `publish-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />} Publish now
                          </button>
                          <button
                            onClick={() => { const n = toInputs(null, tz, true); setScheduling({ projectId: p.id, date: n.date, time: "09:00" }); }}
                            disabled={busy !== null}
                            className={quietBtn}
                          >
                            <CalendarDays size={12} /> Schedule
                          </button>
                        </>
                      )}
                      {booked?.kind === "post" && (
                        <button onClick={() => cancelScheduled(booked.id)} disabled={busy !== null} className={quietBtn}>
                          {busy === `cancel-${booked.id}` ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} Cancel scheduled post
                        </button>
                      )}
                      {!canSend && !published && (
                        <span className="text-[11px] text-spark-ink-faint">
                          {v ? "Ready to publish once rendering finishes." : "No finished video yet."}
                        </span>
                      )}
                    </div>

                    {form && (
                      <div className="mt-2 space-y-2 rounded-xl border border-spark-rule bg-white p-3">
                        <div className="grid grid-cols-[1fr_120px] gap-2">
                          <input
                            type="date"
                            value={form.date}
                            onChange={(e) => setScheduling({ ...form, date: e.target.value })}
                            aria-label="Publish date"
                            className={inputCls}
                          />
                          <input
                            type="time"
                            value={form.time}
                            onChange={(e) => setScheduling({ ...form, time: e.target.value })}
                            aria-label="Publish time"
                            className={inputCls}
                          />
                        </div>
                        <p className="text-[11px] text-spark-ink-faint">
                          YouTube holds the video privately and makes it public at this time, in {tz.replace(/_/g, " ")}.
                        </p>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setScheduling(null)} className={quietBtn}>Cancel</button>
                          <button
                            onClick={() => {
                              if (!form.date) { toast.error("Pick a date."); return; }
                              const at = zonedToUtc(form.date, form.time || "09:00", tz);
                              if (at.getTime() <= Date.now()) { toast.error("Pick a time in the future, or use Publish now."); return; }
                              publish(p, at.toISOString());
                            }}
                            disabled={busy !== null}
                            className={ctaBtn}
                          >
                            {busy === `publish-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <CalendarDays size={12} />} Schedule it
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}

              <li className="flex flex-wrap items-center gap-2 py-2.5">
                <FileText size={14} className="shrink-0 text-spark-ink-faint" />
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] text-spark-ink">Blog · {c.blog.platform || "Website or CRM"}</div>
                  <div className="text-[11px] text-spark-ink-faint">
                    {blogPublished && c.blog.publishedAt ? `Published ${when(c.blog.publishedAt)}`
                      : c.blog.plannedAt ? `Manual publishing reminder · ${when(c.blog.plannedAt)}`
                      : "No reminder set"}
                  </div>
                </div>
                <MethodPill kind="manual" />
                <span className={cn(pill, ITEM_STATUS_META[blogState].chip)}>{blogLabel}</span>
              </li>

              {COMING_SOON_CHANNELS.map((ch) => (
                <li key={ch} className="flex items-center gap-2 py-2.5">
                  <Radio size={14} className="shrink-0 text-spark-rule-dim" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-spark-ink-faint">{platformLabel(ch)}</div>
                    <div className="text-[11px] text-spark-ink-faint">Not connected yet</div>
                  </div>
                  <MethodPill kind="soon" />
                </li>
              ))}
            </ul>

            {!youtubeChannel && (
              <Link href="/settings/social" className="mt-1 inline-block text-[11px] font-medium text-spark-amber hover:underline">
                Connect YouTube
              </Link>
            )}
          </Section>

          {/* ── Spark Series ── */}
          <Section
            icon={Layers}
            title="Spark Series"
            actions={mySeries ? (
              <button onClick={() => setSub("series")} className={quietBtn}><Pencil size={12} /> Manage Series</button>
            ) : (
              <button onClick={() => setSub("series")} className={quietBtn}><Plus size={12} /> Add to a Series</button>
            )}
          >
            {!mySeries ? (
              <p className="text-[12px] text-spark-ink-faint">
                Not in a Series. A Series groups related Sparks — a listing&apos;s coming soon, tour, open house, price change and just sold.
              </p>
            ) : (
              <>
                <ul className="space-y-1.5">
                  {seriesSparks.map((s, i) => {
                    const st = SPARK_STATUS_META[sparkProgress(s, { youtubeConnected: !!youtubeChannel, series: mySeries }).status];
                    const isThis = s.id === c.id;
                    return (
                      <li
                        key={s.id}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                          isThis ? "border-spark-amber bg-spark-amber-tint/50" : "border-spark-rule-soft bg-white",
                        )}
                      >
                        <span className="w-4 shrink-0 text-[11px] text-spark-ink-faint">{i + 1}</span>
                        <button
                          type="button"
                          onClick={() => !isThis && onOpenSpark(s.id)}
                          className="min-w-0 flex-1 text-left"
                          disabled={isThis}
                        >
                          <span className="block truncate text-[12.5px] text-spark-ink">{s.name}</span>
                        </button>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", st.badge)}>{st.label}</span>
                        <span className="flex shrink-0 gap-0.5">
                          <button onClick={() => reorder(i, -1)} disabled={i === 0 || busy !== null} aria-label="Move up" className="rounded p-1 text-spark-ink-faint hover:bg-spark-paper disabled:opacity-30">
                            <ArrowUp size={12} />
                          </button>
                          <button onClick={() => reorder(i, 1)} disabled={i === seriesSparks.length - 1 || busy !== null} aria-label="Move down" className="rounded p-1 text-spark-ink-faint hover:bg-spark-paper disabled:opacity-30">
                            <ArrowDown size={12} />
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-2 flex gap-2">
                  <input
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") planSpark(); }}
                    placeholder="Plan another Spark — e.g. Price Change"
                    aria-label="Name of the planned Spark"
                    className={inputCls}
                  />
                  <button onClick={planSpark} disabled={busy !== null} className={quietBtn}>
                    {busy === "plan" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add Spark
                  </button>
                </div>

                {(mySeries.ctaText || mySeries.destinationUrl) && (
                  <p className="mt-2 text-[11px] text-spark-ink-faint">
                    Series CTA and link are inherited by every Spark that has none of its own. Change them under Manage Series.
                  </p>
                )}
              </>
            )}
          </Section>

          {/* ── Performance ── */}
          <Section icon={BarChart3} title="Spark Performance" actions={<span className="text-[11px] text-spark-ink-faint">Last updated: —</span>}>
            <div className="grid grid-cols-3 gap-2">
              {["Views", "Likes", "Comments"].map((m) => (
                <div key={m} className="rounded-lg bg-spark-paper/70 px-3 py-2">
                  <div className="text-[11px] text-spark-ink-muted">{m}</div>
                  <div className="text-[18px] font-semibold text-spark-ink">—</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-spark-ink-faint">Performance appears after a video publishes to a connected channel.</p>
          </Section>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end border-t border-spark-rule bg-white px-5 py-3">
          <button onClick={() => setSub("review")} className={ctaBtn}>
            <CheckCircle2 size={13} /> Review and Schedule
          </button>
        </div>

        {/* ── Panels over the card ── */}
        {sub === "preview" && (
          <SubPanel title="Preview Article" onClose={() => setSub(null)}>
            <h1 className="text-[20px] font-bold leading-snug text-spark-ink">{c.blog.title || c.name}</h1>
            {/* blogAsHtml escapes the article text, so this is markup we built, not markup we were given. */}
            <div
              className="mt-2 text-[14px] leading-relaxed text-spark-ink-soft [&_h2]:mt-6 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-spark-ink [&_p]:mt-3"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </SubPanel>
        )}

        {sub === "article" && (
          <SubPanel title="Edit Article" onClose={() => setSub(null)}>
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="art-title">Article title</label>
                <input id="art-title" value={article.title} onChange={(e) => setArticle({ ...article, title: e.target.value })} className={inputCls} />
              </div>
              {(["intro", "body", "conclusion"] as const).map((k) => (
                <div key={k}>
                  <label className={labelCls} htmlFor={`art-${k}`}>{k === "intro" ? "Introduction" : k === "body" ? "Body" : "Conclusion"}</label>
                  <textarea
                    id={`art-${k}`}
                    rows={k === "body" ? 16 : 4}
                    value={article[k]}
                    onChange={(e) => setArticle({ ...article, [k]: e.target.value })}
                    className={cn(inputCls, "leading-relaxed")}
                  />
                </div>
              ))}
              <p className="text-[11px] text-spark-ink-faint">
                A line that starts with H2: becomes a heading. Leave a blank line between paragraphs. ·{" "}
                {[article.intro, article.body, article.conclusion].join(" ").trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </p>
              <div className="flex justify-end gap-1.5">
                <button onClick={() => setSub(null)} className={quietBtn}>Cancel</button>
                <button onClick={saveArticle} disabled={busy !== null} className={ctaBtn}>
                  {busy === "article" && <Loader2 size={12} className="animate-spin" />} Save Article
                </button>
              </div>
            </div>
          </SubPanel>
        )}

        {sub === "addVideo" && (
          <SubPanel title="Add Video to Spark" onClose={() => setSub(null)}>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-[12px] text-spark-ink-muted" htmlFor="add-role">Add as</label>
              <select id="add-role" value={addRole} onChange={(e) => setAddRole(e.target.value as CampaignRole)} className={cn(inputCls, "w-auto py-1.5")}>
                {(Object.keys(CAMPAIGN_ROLES) as CampaignRole[]).map((r) => <option key={r} value={r}>{CAMPAIGN_ROLES[r]}</option>)}
              </select>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-spark-ink-faint">
              The video moves here with its posts. If its old Spark is left with nothing in it, that Spark is removed.
              Making a brand-new video for this Spark comes with the new Create flow.
            </p>
            {candidates.length === 0 ? (
              <p className="text-[12px] text-spark-ink-faint">No other videos from September on to add.</p>
            ) : (
              <ul className="space-y-1.5">
                {candidates.map(({ spark, project: p }) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-lg border border-spark-rule-soft bg-white p-2">
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-spark-paper"><PlayCircle size={13} className="text-spark-ink-faint" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-spark-ink">{p.title}</div>
                      <div className="truncate text-[11px] text-spark-ink-faint">In “{spark.name}”</div>
                    </div>
                    <button onClick={() => attach(p.id)} disabled={busy !== null} className={quietBtn}>
                      {busy === `attach-${p.id}` ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SubPanel>
        )}

        {sub === "series" && (
          <SubPanel title={mySeries ? "Manage Series" : "Add to a Series"} onClose={() => setSub(null)}>
            {mySeries ? (
              <div className="space-y-4">
                <div>
                  <label className={labelCls} htmlFor="series-name">Series name</label>
                  <div className="flex gap-2">
                    <input id="series-name" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} className={inputCls} />
                    <button onClick={renameSeries} disabled={busy !== null} className={quietBtn}>Rename</button>
                  </div>
                </div>

                <div className="rounded-xl border border-spark-rule bg-white p-3">
                  <div className="mb-2 text-[12px] font-medium text-spark-ink">Shared CTA and link</div>
                  <p className="mb-2 text-[11px] text-spark-ink-faint">
                    Every Spark in this Series uses these unless it has its own. A listing Series needs the showing link entered once.
                  </p>
                  <label className={labelCls} htmlFor="series-cta">CTA</label>
                  <textarea id="series-cta" rows={2} value={seriesCta.text} onChange={(e) => setSeriesCta({ ...seriesCta, text: e.target.value })} className={inputCls} />
                  <label className={cn(labelCls, "mt-2")} htmlFor="series-link">Destination link</label>
                  <input id="series-link" type="url" value={seriesCta.url} onChange={(e) => setSeriesCta({ ...seriesCta, url: e.target.value })} placeholder="https://" className={inputCls} />
                  <div className="mt-2 flex justify-end">
                    <button onClick={saveSeriesDefaults} disabled={busy !== null} className={ctaBtn}>
                      {busy === "series" && <Loader2 size={12} className="animate-spin" />} Save defaults
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[12px] font-medium text-spark-ink">Move this Spark</div>
                  <div className="space-y-1.5">
                    {series.filter((s) => s.id !== mySeries.id).map((s) => (
                      <button key={s.id} onClick={() => joinSeries(s.id)} disabled={busy !== null} className="flex w-full items-center justify-between gap-2 rounded-lg border border-spark-rule-soft bg-white px-3 py-2 text-left text-[12.5px] text-spark-ink hover:border-spark-amber/50">
                        {s.name}
                        <span className="text-[11px] text-spark-amber">Move here</span>
                      </button>
                    ))}
                    <button onClick={leaveSeries} disabled={busy !== null} className={quietBtn}>Take out of this Series</button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-spark-ink-faint">
                    A Spark that leaves keeps whatever CTA and link it was inheriting.
                  </p>
                </div>

                <div className="border-t border-spark-rule-soft pt-3">
                  <button
                    onClick={() => { if (window.confirm(`Delete the Series “${mySeries.name}”? Its ${seriesSparks.length} Sparks stay, each keeping its CTA and link.`)) deleteSeries(); }}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 size={12} /> Delete Series
                  </button>
                  <p className="mt-1.5 text-[11px] text-spark-ink-faint">The Sparks are kept — only the grouping goes.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className={labelCls} htmlFor="new-series">Start a Series with this Spark</label>
                  <div className="flex gap-2">
                    <input
                      id="new-series"
                      value={newSeriesName}
                      onChange={(e) => setNewSeriesName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") createSeries(); }}
                      placeholder="e.g. 2549 Crestline Drive"
                      className={inputCls}
                    />
                    <button onClick={createSeries} disabled={busy !== null} className={ctaBtn}>
                      {busy === "series" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Create
                    </button>
                  </div>
                </div>
                {series.length > 0 && (
                  <div>
                    <div className="mb-2 text-[12px] font-medium text-spark-ink">Or add it to one you have</div>
                    <div className="space-y-1.5">
                      {series.map((s) => (
                        <button key={s.id} onClick={() => joinSeries(s.id)} disabled={busy !== null} className="flex w-full items-center justify-between gap-2 rounded-lg border border-spark-rule-soft bg-white px-3 py-2 text-left text-[12.5px] text-spark-ink hover:border-spark-amber/50">
                          {s.name}
                          <span className="text-[11px] text-spark-amber">Add here</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </SubPanel>
        )}

        {sub === "review" && (
          <SubPanel title="Review and Schedule" onClose={() => setSub(null)}>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-spark-paper/70 px-3 py-2">
                <div className="text-[11px] text-spark-ink-muted">Content ready</div>
                <div className="text-[16px] font-semibold text-spark-ink">{progress.contentReady} of {progress.contentTotal}</div>
              </div>
              <div className="rounded-lg bg-spark-paper/70 px-3 py-2">
                <div className="text-[11px] text-spark-ink-muted">Publishing setup</div>
                <div className={cn("text-[13px] font-semibold leading-snug", progress.setup.blocking ? "text-[#8D580F]" : "text-emerald-700")}>
                  {progress.setup.summary}
                </div>
              </div>
            </div>
            <div className="spark-eyebrow mb-2 text-[9px]">CONTENT</div>
            <ul className="space-y-2">
              {c.projects.map((p) => {
                const s = videoState(c, p);
                const ok = s === "ready" || s === "scheduled" || s === "published";
                const detail = s === "published" ? "Published on YouTube"
                  : s === "scheduled" ? "Scheduled on YouTube"
                  : s === "ready" ? "Ready. Publish it now, or schedule it, under Channels and Schedule."
                  : s === "rendering" ? "Still rendering"
                  : s === "failed" ? "The last attempt to publish failed"
                  : "No finished video yet";
                return (
                  <li key={p.id} className="rounded-xl border border-spark-rule bg-white p-3">
                    <div className="flex items-start gap-2">
                      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-spark-ink-faint" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-spark-ink">{roleLabel(p)}</div>
                        <div className="text-[11.5px] text-spark-ink-muted">{detail}</div>
                      </div>
                      <MethodPill kind="auto" />
                    </div>
                  </li>
                );
              })}

              {progress.hasBlog || c.blog.projectId ? (
                <li className="rounded-xl border border-spark-rule bg-white p-3">
                  <div className="flex items-start gap-2">
                    {blogReady ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-spark-ink-faint" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-spark-ink">Blog Article</div>
                      <div className="text-[11.5px] text-spark-ink-muted">
                        {blogPublished && c.blog.publishedAt ? `Published ${when(c.blog.publishedAt)}`
                          : !c.blog.hasArticle ? "Not written yet"
                          : c.blog.plannedAt ? `Manual publishing reminder · ${when(c.blog.plannedAt)}`
                          : "Ready. No reminder date yet."}
                      </div>
                      {!c.blog.hasArticle && c.blog.projectId && (
                        <button onClick={sparkBlog} disabled={busy !== null} className="mt-1 text-[11.5px] font-medium text-spark-amber hover:underline">
                          Spark Blog
                        </button>
                      )}
                      {c.blog.hasArticle && !blogPublished && !c.blog.plannedAt && (
                        <button onClick={() => { setSub(null); setEditing("schedule"); }} className="mt-1 text-[11.5px] font-medium text-spark-amber hover:underline">
                          Set a publishing reminder
                        </button>
                      )}
                    </div>
                    <MethodPill kind="manual" />
                  </div>
                </li>
              ) : null}

              <li className="rounded-xl border border-dashed border-spark-rule p-3">
                <div className="flex items-center gap-2">
                  <Radio size={15} className="shrink-0 text-spark-rule-dim" />
                  <div className="flex-1 text-[12px] text-spark-ink-faint">
                    {COMING_SOON_CHANNELS.map(platformLabel).join(", ")}: not connected yet
                  </div>
                  <MethodPill kind="soon" />
                </div>
              </li>
            </ul>

            <div className="spark-eyebrow mb-2 mt-5 text-[9px]">PUBLISHING SETUP</div>
            {progress.setup.needs.length === 0 ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700">
                <CheckCircle2 size={14} /> Complete. Captions, thumbnails, CTA, link and channel are all set.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {progress.setup.needs.map((n) => {
                  const p = n.projectId ? c.projects.find((x) => x.id === n.projectId) : undefined;
                  const label = p ? `${n.label} · ${roleLabel(p)}` : n.label;
                  const fixCls = "shrink-0 text-[11.5px] font-medium text-spark-amber hover:underline";
                  return (
                    <li key={n.key} className="flex items-center gap-2 rounded-lg border border-spark-rule-soft bg-white px-3 py-2">
                      <Circle size={13} className={cn("shrink-0", n.blocking ? "text-[#8D580F]" : "text-spark-ink-faint")} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-spark-ink">{label} needed</div>
                        {!n.blocking && <div className="text-[11px] text-spark-ink-faint">Required once Instagram can publish</div>}
                      </div>
                      {n.fix === "captions" && p && (
                        <button onClick={() => { setSelectedId(p.id); setSub(null); setEditing("captions"); }} className={fixCls}>Edit Captions</button>
                      )}
                      {n.fix === "thumbnail" && p && (
                        <Link href={`/create/${p.id}`} className={fixCls}>Change Thumbnail</Link>
                      )}
                      {n.fix === "cta" && (
                        <button onClick={() => { setSub(null); setEditing("cta"); }} className={fixCls}>Edit CTA</button>
                      )}
                      {n.fix === "youtube" && (
                        <Link href="/settings/social" className={fixCls}>Connect YouTube</Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SubPanel>
        )}
      </div>
    </div>
  );
}
