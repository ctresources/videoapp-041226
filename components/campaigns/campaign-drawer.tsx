"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { BarChart3, CheckCircle2, Copy, ExternalLink, FileText, Link2, Loader2, PlayCircle, Radio, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { blogAsHtml } from "@/lib/utils/blog-html";
import { formatInZone, ymd, zonedParts, zonedToUtc } from "@/lib/utils/time-zone";
import {
  BLOG_STATUSES,
  CAMPAIGN_ROLES,
  campaignStatus,
  isHttpUrl,
  type BlogStatus,
  type Campaign,
} from "@/lib/utils/campaigns";
import { CAMPAIGN_STATUS_META, CHANNELS, ITEM_STATUS_META, platformLabel } from "@/components/campaigns/status-meta";

interface Props {
  campaign: Campaign;
  timeZone: string;
  youtubeChannel: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

type Busy = null | "name" | "cta" | "blog" | "publish" | "copy";

/**
 * The statuses chosen from the menu. Published is reached only through Mark
 * as Published, which insists on the URL, so it is not offered here.
 */
const EDITABLE_BLOG_STATUSES: BlogStatus[] = ["draft", "ready", "scheduled_externally"];

const SITE_SUGGESTIONS = ["BoldTrail", "WordPress", "Squarespace", "Wix", "Webflow"];

const inputCls = "w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-[13px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber/30";
const labelCls = "mb-1 block text-[11px] font-medium text-spark-ink-muted";
const quietBtn = "inline-flex items-center gap-1.5 rounded-full border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink-soft transition hover:bg-spark-paper disabled:opacity-50";
const ctaBtn = "spark-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium disabled:opacity-50";

const pad = (n: number) => String(n).padStart(2, "0");

/** A saved instant as the date and time inputs in the user's zone. */
function toInputs(iso: string | null, tz: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "09:00" };
  const p = zonedParts(new Date(iso), tz);
  return { date: ymd(p.year, p.month, p.day), time: `${pad(p.hour)}:${pad(p.minute)}` };
}

async function patchCampaign(id: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/campaigns", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...fields }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Couldn't save that change.");
}

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <section className="border-t border-spark-rule-soft px-5 py-4">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-spark-ink">
        <Icon size={14} className="text-spark-amber" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export function CampaignDrawer({ campaign: c, timeZone: tz, youtubeChannel, onClose, onSaved }: Props) {
  const [name, setName] = useState(c.name);
  const [cta, setCta] = useState(c.ctaText ?? "");
  const [dest, setDest] = useState(c.destinationUrl ?? "");
  const [blogTitle, setBlogTitle] = useState(c.blog.title ?? "");
  const [blogStatus, setBlogStatus] = useState<BlogStatus>(c.blog.status);
  const [plannedDate, setPlannedDate] = useState(() => toInputs(c.blog.plannedAt, tz).date);
  const [plannedTime, setPlannedTime] = useState(() => toInputs(c.blog.plannedAt, tz).time);
  const [site, setSite] = useState(c.blog.platform ?? "");
  const [blogUrl, setBlogUrl] = useState(c.blog.url ?? "");
  const [busy, setBusy] = useState<Busy>(null);

  // Re-seed when another campaign opens, or a save brings back fresh values.
  useEffect(() => {
    const planned = toInputs(c.blog.plannedAt, tz);
    setName(c.name);
    setCta(c.ctaText ?? "");
    setDest(c.destinationUrl ?? "");
    setBlogTitle(c.blog.title ?? "");
    setBlogStatus(c.blog.status);
    setPlannedDate(planned.date);
    setPlannedTime(planned.time);
    setSite(c.blog.platform ?? "");
    setBlogUrl(c.blog.url ?? "");
  }, [c, tz]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = CAMPAIGN_STATUS_META[campaignStatus(c)];
  const published = c.blog.status === "published";
  const lead = c.projects.find((p) => p.role === "primary") ?? c.projects[0];
  const leadVideo = lead?.videos.filter((v) => v.renderStatus === "completed" && v.videoUrl).pop();
  const posts = [...c.posts].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const when = (iso: string) =>
    formatInZone(new Date(iso), tz, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  async function run(kind: Exclude<Busy, null>, fields: Record<string, unknown>, done: string) {
    setBusy(kind);
    try {
      await patchCampaign(c.id, fields);
      toast.success(done);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that change.");
    } finally {
      setBusy(null);
    }
  }

  function saveName() {
    const next = name.trim();
    if (next === c.name) return;
    if (!next) { setName(c.name); toast.error("A campaign needs a name."); return; }
    run("name", { name: next }, "Campaign renamed.");
  }

  function saveCta() {
    const link = dest.trim();
    if (link && !isHttpUrl(link)) {
      toast.error("The destination link must be a full web address, starting with https://");
      return;
    }
    run("cta", { cta_text: cta, destination_url: link || null }, "CTA saved.");
  }

  /** The blog fields as they stand in the form — shared by Save and Mark as Published. */
  function blogFields(): Record<string, unknown> | null {
    const url = blogUrl.trim();
    if (url && !isHttpUrl(url)) {
      toast.error("The published URL must be a full web address, starting with https://");
      return null;
    }
    return {
      blog_title: blogTitle,
      blog_platform: site,
      blog_url: url || null,
      blog_planned_at: plannedDate ? zonedToUtc(plannedDate, plannedTime || "09:00", tz).toISOString() : null,
    };
  }

  function saveBlog() {
    const fields = blogFields();
    if (!fields) return;
    run("blog", published ? fields : { ...fields, blog_status: blogStatus }, "Article details saved.");
  }

  function markPublished() {
    const fields = blogFields();
    if (!fields) return;
    if (!fields.blog_url) {
      toast.error("Paste the article's published URL first, so the campaign can link to it.");
      return;
    }
    run("publish", { ...fields, blog_status: "published", blog_published_at: new Date().toISOString() }, "Article marked as published.");
  }

  function unpublish() {
    run("publish", { blog_status: "ready" }, "Article moved back to Ready.");
  }

  async function copyHtml() {
    setBusy("copy");
    try {
      const res = await fetch(`/api/campaigns/blog?campaignId=${encodeURIComponent(c.id)}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't load the article.");
      await navigator.clipboard.writeText(blogAsHtml(body.blog));
      toast.success("Blog HTML copied. Paste into your site's HTML view.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't copy the article.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={c.name}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[520px] flex-col overflow-y-auto bg-[#fffdf9] shadow-brand-lg"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-spark-rule bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="spark-eyebrow text-[9px]">CAMPAIGN</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              aria-label="Campaign name"
              className="mt-0.5 w-full rounded bg-transparent text-[17px] font-bold text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber/30"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", status.badge)}>{status.label}</span>
              <span className="text-[11px] text-spark-ink-faint">
                Started {formatInZone(new Date(c.createdAt), tz, { month: "short", day: "numeric", year: "numeric" })}
              </span>
              {busy === "name" && <Loader2 size={11} className="animate-spin text-spark-ink-faint" />}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-spark-ink-faint hover:bg-spark-paper">
            <X size={16} />
          </button>
        </div>

        {/* Projects and videos */}
        <Section icon={PlayCircle} title="Projects and videos">
          {leadVideo?.videoUrl ? (
            // #t= gives iOS a first frame to show before playback.
            <video
              src={`${leadVideo.videoUrl}#t=0.1`}
              controls
              playsInline
              preload="metadata"
              className="mb-3 aspect-video w-full rounded-lg bg-black object-contain"
            />
          ) : lead?.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.thumbnailUrl} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" />
          ) : null}
          <ul className="space-y-2">
            {c.projects.map((p) => {
              const finished = p.videos.filter((v) => v.renderStatus === "completed").length;
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-spark-rule-soft bg-white p-2">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnailUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-spark-paper">
                      <PlayCircle size={13} className="text-spark-ink-faint" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium text-spark-ink">{p.title}</div>
                    <div className="text-[11px] text-spark-ink-faint">
                      {p.role ? CAMPAIGN_ROLES[p.role] : "No role yet"} · {finished} {finished === 1 ? "video" : "videos"}
                    </div>
                  </div>
                  <Link href={`/create/${p.id}`} className="shrink-0 text-[11px] font-medium text-spark-amber hover:underline">
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Call to action */}
        <Section icon={Link2} title="Call to action">
          <label className={labelCls} htmlFor="cta-text">CTA</label>
          <textarea
            id="cta-text"
            rows={2}
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder={lead?.cta ? `From the script: ${lead.cta}` : "What should viewers do next?"}
            className={inputCls}
          />
          <label className={cn(labelCls, "mt-3")} htmlFor="cta-link">Destination link</label>
          <input
            id="cta-link"
            type="url"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
            placeholder="https://"
            className={inputCls}
          />
          <div className="mt-3 flex justify-end">
            <button onClick={saveCta} disabled={busy !== null} className={ctaBtn}>
              {busy === "cta" && <Loader2 size={12} className="animate-spin" />}
              Save CTA
            </button>
          </div>
        </Section>

        {/* Blog article */}
        <Section icon={FileText} title="Blog article">
          <label className={labelCls} htmlFor="blog-title">Article title</label>
          <input id="blog-title" value={blogTitle} onChange={(e) => setBlogTitle(e.target.value)} className={inputCls} />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="blog-status">Status</label>
              {published ? (
                <div className={cn("rounded-lg border px-3 py-2 text-[13px] font-medium", ITEM_STATUS_META.published.chip)}>
                  Published
                </div>
              ) : (
                <select
                  id="blog-status"
                  value={blogStatus}
                  onChange={(e) => setBlogStatus(e.target.value as BlogStatus)}
                  className={inputCls}
                >
                  {EDITABLE_BLOG_STATUSES.map((s) => <option key={s} value={s}>{BLOG_STATUSES[s]}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="blog-site">Website or platform</label>
              <input
                id="blog-site"
                list="blog-site-suggestions"
                value={site}
                onChange={(e) => setSite(e.target.value)}
                placeholder="BoldTrail"
                className={inputCls}
              />
              <datalist id="blog-site-suggestions">
                {SITE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>

          <div className="mt-3">
            <label className={labelCls} htmlFor="blog-date">Planned publication date</label>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <input id="blog-date" type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} className={inputCls} />
              <input type="time" value={plannedTime} onChange={(e) => setPlannedTime(e.target.value)} aria-label="Planned time" className={inputCls} />
            </div>
          </div>

          <div className="mt-3">
            <label className={labelCls} htmlFor="blog-url">Published URL</label>
            <input
              id="blog-url"
              type="url"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="https://yoursite.com/blog/…"
              className={inputCls}
            />
          </div>

          <p className="mt-3 text-[12px] text-spark-ink-muted">
            Actual publication date:{" "}
            <span className="text-spark-ink">{c.blog.publishedAt ? when(c.blog.publishedAt) : "not published yet"}</span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={copyHtml} disabled={busy !== null} className={quietBtn}>
              {busy === "copy" ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
              Copy as HTML
            </button>
            <button onClick={saveBlog} disabled={busy !== null} className={quietBtn}>
              {busy === "blog" && <Loader2 size={12} className="animate-spin" />}
              Save details
            </button>
            {published ? (
              <button onClick={unpublish} disabled={busy !== null} className={quietBtn}>
                {busy === "publish" && <Loader2 size={12} className="animate-spin" />}
                Mark as not published
              </button>
            ) : (
              <button onClick={markPublished} disabled={busy !== null} className={ctaBtn}>
                {busy === "publish" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Mark as Published
              </button>
            )}
          </div>

          {published && c.blog.url && (
            <a
              href={c.blog.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[12px] text-spark-amber hover:underline"
            >
              View the published article <ExternalLink size={11} />
            </a>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-spark-ink-faint">
            Copy the HTML and paste it into BoldTrail or your website, then come back, add the published URL and mark it published.
          </p>
        </Section>

        {/* Social posts and channels */}
        <Section icon={Radio} title="Social posts">
          {posts.length === 0 ? (
            <p className="text-[12px] text-spark-ink-faint">Nothing has been posted from this campaign yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {posts.map((p) => {
                const meta = ITEM_STATUS_META[p.status];
                return (
                  <li key={`${p.kind}-${p.id}`} className="flex items-center gap-3 rounded-lg border border-spark-rule-soft bg-white px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] text-spark-ink">{p.title || platformLabel(p.platform)}</div>
                      <div className="text-[11px] text-spark-ink-faint">
                        {platformLabel(p.platform)}{p.at ? ` · ${when(p.at)}` : ""}
                      </div>
                      {p.lastError && <div className="mt-0.5 text-[11px] text-red-600">{p.lastError}</div>}
                    </div>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.chip)}>
                      {meta.label}
                    </span>
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" aria-label="Open post" className="shrink-0 text-spark-ink-faint hover:text-spark-amber">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <div className={labelCls}>Channels</div>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((ch) => ch === "youtube" ? (
                <span
                  key={ch}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px]",
                    youtubeChannel ? "border-[#dbe1e8] bg-[#eff2f5] text-[#5b6b7d]" : "border-spark-rule bg-white text-spark-ink-muted",
                  )}
                >
                  YouTube · {youtubeChannel ?? "not connected"}
                </span>
              ) : (
                <span key={ch} className="rounded-full border border-dashed border-spark-rule px-2.5 py-1 text-[11px] text-spark-ink-faint">
                  {platformLabel(ch)} · coming soon
                </span>
              ))}
            </div>
            {!youtubeChannel && (
              <Link href="/settings/social" className="mt-2 inline-block text-[11px] font-medium text-spark-amber hover:underline">
                Connect YouTube
              </Link>
            )}
          </div>
        </Section>

        {/* Results */}
        <Section icon={BarChart3} title="Results">
          <p className="text-[12px] text-spark-ink-faint">Views, likes and comments for each published video will show here.</p>
        </Section>
      </div>
    </div>
  );
}
