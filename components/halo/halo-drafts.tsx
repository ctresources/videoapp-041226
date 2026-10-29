"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, Copy, ExternalLink, Loader2, MessageSquare, Play, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { ListenButton } from "@/components/ui/listen-button";
import { kindLabel } from "@/lib/halo/kinds";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import type { Halo, HaloDraft } from "@/components/halo/use-halo";
import { ThumbnailEditButton } from "@/components/social/thumbnail-edit-button";
import { cleanThumbStyle, type ThumbStyle } from "@/lib/utils/thumbnail-style";
import { videoStatus } from "@/lib/utils/video-status";
import { VideoStatusLine } from "@/components/ui/video-status-line";
import {
  LookPicker, PLATFORM_LABELS, PLATFORM_ORDER, PlatformPicker, Row, Switch, tile,
} from "@/components/halo/halo-sites-card";

/**
 * Halo drafts on the AutoSparks page (2026-10-24, the owner's mockup): each
 * with its thumbnail and setup at a glance, a Setup panel to change any of it
 * for this one video, Make video then Approve to post it, and once it is out, the
 * message to text Halo so it goes on the post itself.
 */

/** The number Halo members text (owner, 2026-10-24). */
const HALO_SMS = "+14157263224";

const SHORT: Record<string, string> = { facebook: "FB", instagram: "IG", youtube: "YT", google_business: "Google", linkedin: "LinkedIn", tiktok: "TikTok", x: "X", threads: "Threads" };

function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric" });
}
function minutes(d: HaloDraft) {
  const s = d.projects?.ai_script;
  const words = [s?.hook, s?.script, s?.cta].join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  const m = words / 145;
  return m < 1.25 ? "~1 min" : m < 1.75 ? "~1½ min" : `~${Math.round(m)} min`;
}
function spoken(d: HaloDraft) {
  const s = d.projects?.ai_script;
  return [s?.hook, s?.script, s?.cta].filter(Boolean).join("\n\n");
}
/** What the caption will say; the same words lib/halo/post.ts sends. */
function captionOf(d: HaloDraft) {
  const hook = d.projects?.ai_script?.hook || d.projects?.ai_script?.title || d.topic;
  if (d.source === "halo_promo") {
    const p = d.setup.promo;
    const how = p?.code ? `Start free: text ${p.code}${p.angle === "pro" ? " PRO" : ""} to ${p.phone ?? "Halo"}.` : "";
    return [hook, how, d.source_url, "#ad · I earn a referral fee if you join with my code."].filter(Boolean).join("\n\n");
  }
  return [hook, d.source_url && `Full post: ${d.source_url}`].filter(Boolean).join("\n\n");
}
/** The local value a datetime-local input wants. */
function localInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function Thumb({ d, big = false, onOpen }: { d: HaloDraft; big?: boolean; onOpen?: () => void }) {
  const url = d.projects?.thumbnail_url;
  const vertical = d.setup.size !== "horizontal";
  const size = big
    ? vertical ? "h-[267px] w-[150px]" : "h-[113px] w-[200px]"
    : vertical ? "h-[139px] w-[78px]" : "h-[62px] w-[110px]";
  const box = `${size} shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#5d7d8f] to-[#1f2f38]`;
  // Tap to see it full size (2026-10-26, the owner's ask).
  if (url && onOpen) {
    return (
      <button type="button" onClick={onOpen} aria-label="See the thumbnail full size" className={`${box} cursor-zoom-in ring-spark-amber transition hover:ring-2`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </button>
    );
  }
  return (
    <div className={box}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : d.status === "writing" ? <div className="flex h-full items-center justify-center"><Loader2 size={16} className="animate-spin text-white/80" /></div> : null}
    </div>
  );
}

/** The thumbnail full size, wide and (for a vertical video) tall. */
function ThumbView({ d, onClose }: { d: HaloDraft; onClose: () => void }) {
  const wide = d.projects?.thumbnail_url;
  const tall = d.setup.size !== "horizontal" ? d.projects?.seo_data?.thumbnail_tall_url : null;
  if (!wide) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative flex max-h-full w-full max-w-5xl flex-col items-center gap-4 overflow-auto sm:flex-row sm:items-start sm:justify-center" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-0 top-0 z-10 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
          <X size={18} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wide} alt="Thumbnail" className="w-full max-w-3xl rounded-xl" />
        {tall && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tall} alt="Tall thumbnail" className="max-h-[80vh] w-auto rounded-xl" />
        )}
      </div>
    </div>
  );
}

function Chips({ d }: { d: HaloDraft }) {
  const town = [d.projects?.location_city, d.projects?.location_state].filter(Boolean).join(", ");
  const len = minutes(d);
  const plats = PLATFORM_ORDER.filter((p) => d.setup.platforms?.includes(p)).map((p) => SHORT[p]).join(" · ");
  const chip = "rounded-lg border border-spark-rule bg-[#faf9f5] px-2 py-0.5 text-[12.5px] text-spark-ink-soft";
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className={`${chip} font-semibold text-spark-ink`}>{d.setup.look === "full" ? "Avatar video" : "Avatar in circle"}</span>
      <span className={chip}>{d.setup.size === "horizontal" ? "Horizontal 16:9" : "Vertical 9:16"}</span>
      {town && d.source !== "halo_promo" && <span className={chip}>📍 {town}</span>}
      {len && <span className={chip}>{len}</span>}
      {d.setup.captions !== false && <span className={chip}>Captions</span>}
      {plats && <span className={chip}>{plats}</span>}
    </div>
  );
}

function Setup({ d, halo, onClose }: { d: HaloDraft; halo: Halo; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const hasPostPhoto = !!d.setup.sourceImage || (d.source === "halo" && !!d.halo_page_id);
  const from = d.source === "email" ? "the email" : "the post";
  const pic = async (p: "post" | "ai" | "upload", file?: File) => {
    setBusy(p);
    await halo.setPicture(d, p, file);
    setBusy(null);
  };
  return (
    <div className="mt-4 flex flex-col gap-5 border-t border-spark-rule pt-4 sm:flex-row">
      <div className="flex flex-col items-center gap-2">
        <Thumb d={d} big />
        <ListenButton text={spoken(d)} label="Listen to script" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Row label="Picture">
          {hasPostPhoto && <button type="button" className={tile(d.setup.picture === "post")} onClick={() => void pic("post")} disabled={!!busy}>{busy === "post" ? "…" : `From ${from}`}</button>}
          <button type="button" className={tile(d.setup.picture === "ai")} onClick={() => void pic("ai")} disabled={!!busy}>{busy === "ai" ? "…" : "AI picture"}</button>
          <button type="button" className={tile(d.setup.picture === "upload")} onClick={() => fileRef.current?.click()} disabled={!!busy}>{busy === "upload" ? "…" : "Upload"}</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pic("upload", f); }} />
        </Row>
        <Row label="Look">
          <button type="button" className={tile(d.setup.look === "circle")} onClick={() => void halo.patchSetup(d, { look: "circle" })}>Avatar in circle</button>
          <button type="button" className={tile(d.setup.look === "full")} onClick={() => void halo.patchSetup(d, { look: "full" })}>Avatar video</button>
        </Row>
        <Row label="Avatar">
          <LookPicker looks={halo.looks} twinLookId={halo.twinLookId} twinLookIds={halo.twinLookIds} value={d.setup.lookId} onChange={(id) => void halo.patchSetup(d, { lookId: id })} />
        </Row>
        <Row label="Size">
          <button type="button" className={tile(d.setup.size !== "horizontal")} onClick={() => void halo.patchSetup(d, { size: "vertical" })}>Vertical 9:16</button>
          <button type="button" className={tile(d.setup.size === "horizontal")} onClick={() => void halo.patchSetup(d, { size: "horizontal" })}>Horizontal 16:9</button>
        </Row>
        <Row label="On screen">
          <button type="button" className={tile(d.setup.onScreen !== "post")} onClick={() => void halo.patchSetup(d, { onScreen: "stock" })}>Stock clips of the area</button>
          {d.setup.photos?.length > 0 && (
            <button type="button" className={tile(d.setup.onScreen === "post")} onClick={() => void halo.patchSetup(d, { onScreen: "post" })}>Photos from {from}</button>
          )}
        </Row>
        <Row label="Captions">
          <Switch on={d.setup.captions !== false} onClick={() => void halo.patchSetup(d, { captions: d.setup.captions === false })} />
        </Row>
        <Row label="Music">
          <select value={d.setup.music} onChange={(e) => void halo.patchSetup(d, { music: e.target.value })}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber">
            {MUSIC_PRESETS.filter((m) => m.id !== "custom").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </Row>
        <Row label="Post to">
          <PlatformPicker connected={halo.connected} value={d.setup.platforms ?? []} onChange={(v) => void halo.patchSetup(d, { platforms: v })} />
        </Row>
        <Row label="Caption">
          <p className="w-full whitespace-pre-line rounded-xl border border-spark-rule bg-[#faf9f5] px-3 py-2 text-[13px] leading-relaxed text-spark-ink-soft">{captionOf(d)}</p>
        </Row>
        <Row label="When">
          <input type="datetime-local" defaultValue={localInput(d.slot_at)}
            onBlur={(e) => { if (e.target.value) void halo.setWhen(d, new Date(e.target.value).toISOString()); }}
            className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber" />
        </Row>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="text-[13px] font-semibold text-spark-blue">Done</button>
        </div>
      </div>
    </div>
  );
}

function PutOnHalo({ d }: { d: HaloDraft }) {
  // The YouTube link when it went out from here; otherwise the agent pastes
  // the link of the one they posted by hand (2026-10-26).
  const [link, setLink] = useState(d.youtubeUrl || d.videoUrl || "");
  const title = d.projects?.ai_script?.title || d.topic;
  const message = `Halo, add this video to the top of my post "${title}" (${d.source_url}): ${link.trim()}`;
  return (
    <div className="mt-3 rounded-xl border-[1.5px] border-spark-blue bg-[#f6fafc] p-3">
      <label className="mb-1 block text-xs font-semibold text-spark-ink-soft">Your video&apos;s link</label>
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="Paste the YouTube link of the video you posted"
        className="mb-2 w-full rounded-lg border border-spark-rule bg-white px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
      />
      <p className="mb-2 text-[12px] text-spark-ink-muted">Send it once the video is live on your channel, so the link plays.</p>
      <p className="text-sm leading-relaxed text-spark-ink">{message}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <a href={`sms:${HALO_SMS}?&body=${encodeURIComponent(message)}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-spark-blue px-3 py-1.5 text-sm font-semibold text-white">
          <MessageSquare size={14} /> Text Halo
        </a>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => {
          try { await navigator.clipboard.writeText(message); toast.success("Copied."); } catch { toast.error("Couldn't copy."); }
        }}><Copy size={13} /> Copy</Button>
      </div>
    </div>
  );
}

/** The card's place in Draft → Made → Approved → Posted (2026-10-26). */
function cardStatus(d: HaloDraft) {
  const draftReady = !!d.madeVideo?.ready;
  return videoStatus({
    hasVideo: !!(d.madeVideo || d.video_id),
    ready: d.status === "draft" ? draftReady : !!d.videoReady,
    failed: !!d.videoFailed,
    autoPost: d.status === "approved" ? { slotAt: d.slot_at, platforms: d.setup.platforms ?? [] } : null,
    posts: d.posts ?? [],
  });
}

/** When to text Halo: once the video is public on the channel (2026-10-26). */
function haloTextNote(d: HaloDraft) {
  return `After it's published on your channel on ${when(d.slot_at)}, come back here and press Put on my Halo post to text Halo the link.`;
}

/** The day and time it posts, editable until it is handed to the accounts. */
function WhenInput({ d, halo }: { d: HaloDraft; halo: Halo }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-[13px] text-spark-ink-soft">
      <span className="font-semibold text-spark-ink">Posts on</span>
      <input
        type="datetime-local"
        key={d.slot_at}
        defaultValue={localInput(d.slot_at)}
        onBlur={(e) => {
          if (!e.target.value) return;
          const iso = new Date(e.target.value).toISOString();
          if (iso !== new Date(d.slot_at).toISOString()) void halo.setWhen(d, iso);
        }}
        className="rounded-lg border border-spark-rule bg-white px-2 py-1 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
      />
    </label>
  );
}

/** What the auto-post would write, the same as lib/halo/post.ts. */
function defaultWords(d: HaloDraft) {
  const seo = d.projects?.seo_data ?? {};
  const ai = d.projects?.ai_script ?? {};
  const hook = ai.hook || ai.title || d.topic;
  const caption = captionOf(d);
  const title = (seo.youtube_title || ai.title || d.projects?.title || d.topic || "").slice(0, 100);
  const description = d.source === "halo_promo"
    ? caption
    : [seo.youtube_description || hook, d.source_url && `Read the full post: ${d.source_url}`].filter(Boolean).join("\n\n");
  return { title, description, caption };
}

/** The title, description and caption that go out with it (2026-10-26). */
function WordsEditor({ d, halo }: { d: HaloDraft; halo: Halo }) {
  const def = defaultWords(d);
  const saved = d.setup.words ?? {};
  const [title, setTitle] = useState(saved.title ?? def.title);
  const [description, setDescription] = useState(saved.description ?? def.description);
  const [caption, setCaption] = useState(saved.caption ?? def.caption);
  const [saving, setSaving] = useState(false);
  const plats = d.setup.platforms ?? [];
  const yt = plats.includes("youtube");
  const others = plats.some((p) => p !== "youtube");
  const box = "w-full rounded-lg border border-spark-rule bg-white px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber";

  async function save() {
    setSaving(true);
    await halo.patchSetup(d, { words: { title, description, caption } });
    setSaving(false);
    toast.success("Saved. These words go out with it.");
  }

  if (!yt && !others) return <p className="text-[13px] text-spark-ink-muted">Pick its accounts in Setup first.</p>;
  return (
    <div className="flex flex-col gap-2">
      {yt && (
        <>
          <label className="text-xs font-semibold text-spark-ink-soft">YouTube title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={box} />
          <label className="text-xs font-semibold text-spark-ink-soft">YouTube description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={5000} className={box} />
        </>
      )}
      {others && (
        <>
          <label className="text-xs font-semibold text-spark-ink-soft">Caption for the other accounts</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2200} className={box} />
        </>
      )}
      <div>
        <Button size="sm" onClick={() => void save()} loading={saving}>Save words</Button>
      </div>
    </div>
  );
}

/** The thumbnail editor from Publish, on the card (2026-10-26). */
function ThumbEdit({ d, halo }: { d: HaloDraft; halo: Halo }) {
  if (!d.project_id) return null;
  return (
    <ThumbnailEditButton
      projectId={d.project_id}
      photos={d.setup.photos ?? []}
      seo={d.projects?.seo_data ?? null}
      city={d.projects?.location_city}
      state={d.projects?.location_state}
      onDone={() => void halo.reloadDrafts()}
    />
  );
}

/** Before Approve: when, the thumbnail and the words (2026-10-26). */
function ReadyPanel({ d, halo }: { d: HaloDraft; halo: Halo }) {
  const [words, setWords] = useState(false);
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-spark-rule bg-[#faf9f5] p-3">
      <WhenInput d={d} halo={halo} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setWords((w) => !w)}>
          {words ? "Close title and caption" : "Edit title and caption"}
        </Button>
      </div>
      {words && <WordsEditor d={d} halo={halo} />}
    </div>
  );
}

/** On an approved card, before it posts: watch it, and fix the thumbnail or words. */
function ApprovedActions({ d, halo }: { d: HaloDraft; halo: Halo }) {
  const [words, setWords] = useState(false);
  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {d.videoUrl && (
          <a href={d.videoUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button>
          </a>
        )}
        <ThumbEdit d={d} halo={halo} />
        <Button size="sm" variant="outline" onClick={() => setWords((w) => !w)}>
          {words ? "Close title and caption" : "Edit title and caption"}
        </Button>
      </div>
      {words && <div className="mt-3"><WordsEditor d={d} halo={halo} /></div>}
    </>
  );
}

export function Card({ d, halo, needsVideo, onOutOfVideos }: { d: HaloDraft; halo: Halo; needsVideo: boolean; onOutOfVideos: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [viewThumb, setViewThumb] = useState(false);
  const title = d.projects?.ai_script?.title || d.topic;
  const hook = d.projects?.ai_script?.hook;
  const tag = d.source === "halo_promo" ? "Halo · Promo" : d.source === "email" ? "Email" : d.source === "sparklee" ? "Sparklee" : `Halo · ${kindLabel(d.source_kind ?? "")}`;
  const done = d.status === "scheduled" || d.status === "posted";

  /**
   * Make video, then Approve (2026-10-26, the owner's ask): the video is made
   * and watched here first, and only Approve sets it to post by itself.
   */
  async function approve(kind: "make" | "approve") {
    // No video left for it: the Upgrade / Buy popup (2026-10-24). Not when its
    // video is already made: posting that one uses nothing.
    if (kind === "make" && needsVideo && !d.madeVideo) { onOutOfVideos(); return; }
    setApproving(true);
    const err = kind === "make" ? await halo.make(d) : await halo.approve(d);
    setApproving(false);
    if (!err) { setOpen(false); return; }
    if (err.code === "out_of_videos") {
      onOutOfVideos();
    } else if (err.code === "no_headshot") {
      toast((t) => (
        <span className="flex flex-col gap-2 text-sm">
          <span>Add your headshot first. Nothing was charged.</span>
          <a href="/settings" onClick={() => toast.dismiss(t.id)} className="self-start rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white">Add my headshot</a>
        </span>
      ), { duration: 12000 });
    } else if (err.code === "twin_consent_required") {
      toast.error("Your Digital Twin needs your one-time approval. Open the video in the editor to approve it. Nothing was charged.", { duration: 10000 });
    } else {
      toast.error(String(err.error ?? "Couldn't start the video. Try again."));
    }
  }

  function recordMyself() {
    const script = spoken(d);
    if (!script) return;
    try { sessionStorage.setItem("camera-record-script", script); } catch { /* unavailable */ }
    router.push("/create?tab=camera");
  }

  return (
    <div className="rounded-2xl border border-spark-rule bg-white p-4">
      <div className="flex gap-3.5">
        {!open && <Thumb d={d} onOpen={() => setViewThumb(true)} />}
        {viewThumb && <ThumbView d={d} onClose={() => setViewThumb(false)} />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-spark-ink-muted">
            <span className="font-bold text-spark-ink">{when(d.slot_at)}</span>
            {needsVideo && !d.madeVideo && d.status === "draft" && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700">Needs 1 more video</span>}
            <span className={`rounded-full border px-2 py-0.5 font-semibold ${d.source === "halo_promo" ? "border-[#f1d9b0] bg-spark-amber-tint text-[#A3660F]" : d.source === "email" ? "border-spark-rule bg-[#faf9f5] text-spark-ink-soft" : "border-[#cfe2ec] bg-[#eef5f9] text-spark-blue"}`}>{tag}</span>
          </div>
          <p className="mt-1.5 text-base font-semibold leading-snug text-spark-ink">{title}</p>
          {hook && d.status !== "writing" && !done && <p className="mt-0.5 line-clamp-2 text-sm text-spark-ink-muted">&ldquo;{hook}&rdquo;</p>}
          {d.status !== "writing" && d.status !== "failed" && !done && <Chips d={d} />}
          {/* Draft → Made → Approved → Posted, with real account ticks (2026-10-26). */}
          {d.status !== "writing" && d.status !== "failed" && (
            <div className="mt-2.5"><VideoStatusLine status={cardStatus(d)} compact /></div>
          )}
          {d.source_url && (
            <a href={d.source_url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 truncate text-[13px] text-spark-blue">
              <span className="truncate">{d.source_url.replace(/^https?:\/\//, "")}</span> <ExternalLink size={11} className="shrink-0" />
            </a>
          )}
          {d.post_error && <p className="mt-1.5 text-[13px] text-red-600">{d.post_error}</p>}
        </div>
      </div>

      {open && d.status === "draft" && <Setup d={d} halo={halo} onClose={() => setOpen(false)} />}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {d.status === "writing" && (
          <span className="flex items-center gap-1.5 text-xs text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Writing…</span>
        )}
        {d.status === "failed" && (
          <>
            <span className="text-xs text-red-600">This one couldn&apos;t be written.</span>
            <button onClick={() => void halo.skip(d)} className="text-xs font-medium text-spark-ink-muted underline">Remove</button>
          </>
        )}
        {d.status === "draft" && (
          <>
            {!d.madeVideo && (
              <Button size="sm" onClick={() => void approve("make")} loading={approving}>Make video</Button>
            )}
            {d.madeVideo && !d.madeVideo.ready && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-spark-ink-muted">
                <Loader2 size={13} className="animate-spin" /> Making your video…
              </span>
            )}
            {d.madeVideo?.ready && (
              <>
                {d.madeVideo.url && (
                  <a href={d.madeVideo.url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button>
                  </a>
                )}
                {/* Next to Watch, so the thumbnail is checked too (2026-10-26). */}
                <ThumbEdit d={d} halo={halo} />
                <Button size="sm" onClick={() => void approve("approve")} loading={approving}>Approve to post</Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>{open ? "Close setup" : "Setup"}</Button>
            {d.project_id && <Link href={`/create/${d.project_id}`}><Button size="sm" variant="outline">Edit script</Button></Link>}
            {d.source === "halo_promo" && d.setup.promo && (
              <Button size="sm" variant="outline" loading={rewriting} onClick={async () => {
                const site = halo.sites.find((x) => x.url === d.source_url);
                if (!site) return;
                setRewriting(true);
                await halo.promo(site.id, d.setup.promo!.angle, d.id);
                setRewriting(false);
              }}>New script</Button>
            )}
            {d.source !== "halo_promo" && (
              <Button size="sm" variant="outline" onClick={recordMyself} className="gap-1.5"><Camera size={13} /> Record it myself</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void halo.skip(d)}>Skip</Button>
            {!open && <ListenButton text={spoken(d)} />}
            {/* What each step does, so it isn't posted by hand as well (2026-10-26). */}
            <p className={`w-full rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${d.madeVideo?.ready ? "border border-amber-200 bg-amber-50 text-amber-900" : "text-spark-ink-muted"}`}>
              {!d.madeVideo
                ? "Make video makes it for you to watch. Nothing posts until you approve it."
                : !d.madeVideo.ready
                  ? "When it's done, watch it here, then press Approve to post. Nothing posts until you approve it."
                  : <>Watch it first. <strong>Approve to post</strong> and it posts by itself on {when(d.slot_at)}
                      {d.setup.platforms?.length ? ` to ${PLATFORM_ORDER.filter((p) => (d.setup.platforms ?? []).includes(p)).map((p) => PLATFORM_LABELS[p]).join(", ")}` : ""}.
                      {" "}<strong>Don&apos;t post this video yourself</strong> from My Sparks, or it will go up twice.
                      {d.source === "halo" && <>{" "}{haloTextNote(d)}</>}</>}
            </p>
          </>
        )}
        {d.status === "draft" && d.madeVideo?.ready && <div className="w-full"><ReadyPanel d={d} halo={halo} /></div>}
        {d.status === "approved" && (
          // What happens next, so nobody waits on this page (2026-10-24, the
          // owner's ask): it lands in My Sparks and posts on its day by itself.
          <div className="w-full rounded-xl border border-spark-rule bg-[#faf9f5] px-3.5 py-3">
            {/* The status line above says it's approved and when it posts. */}
            {d.source === "halo" && !d.on_halo_at && <p className="mb-2.5 text-[13px] leading-relaxed text-spark-ink-soft">{haloTextNote(d)}</p>}
            <WhenInput d={d} halo={halo} />
            {/* Watch, thumbnail and words stay changeable here until it posts
                (2026-10-26, the owner's ask). Open My Sparks and Make another
                are gone: My Sparks led to posting it by hand. */}
            <ApprovedActions d={d} halo={halo} />
          </div>
        )}
        {done && (
          <>
            {d.videoUrl && (
              <a href={d.videoUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button></a>
            )}
            {d.source === "halo" && !d.on_halo_at && d.status === "scheduled" && Date.parse(d.slot_at) > Date.now() && (
              <span className="w-full text-[13px] text-spark-ink-muted">{haloTextNote(d)}</span>
            )}
          </>
        )}
      </div>
      {/* Always there on a Halo card, so a video posted by hand can go on
          the post too; the sheet takes a pasted link (2026-10-26). */}
      {d.source === "halo" && d.status !== "writing" && d.status !== "failed" && (
        d.on_halo_at ? (
          // Seen on the post by the morning check, or marked (2026-10-26).
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full border border-[#bfe3cf] bg-[#e8f5ee] px-3 py-1 text-sm font-semibold text-[#0f7a52]">✓ On your Halo post</span>
            <button type="button" onClick={() => void halo.markOnHalo(d, false)} className="text-xs text-spark-ink-faint underline">Not yet</button>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSheet((x) => !x)}
              className="rounded-lg bg-spark-blue px-3 py-1.5 text-sm font-semibold text-white">Put on my Halo post</button>
            {(d.videoUrl || d.youtubeUrl || d.madeVideo?.ready) && (
              <button type="button" onClick={() => { setSheet(false); void halo.markOnHalo(d, true); }}
                className="rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-sm font-semibold text-spark-ink">It&apos;s on my post</button>
            )}
          </div>
        )
      )}
      {sheet && !d.on_halo_at && <PutOnHalo d={d} />}
    </div>
  );
}

function AlsoNew({ halo }: { halo: Halo }) {
  const [pick, setPick] = useState<string | null>(null);
  const swappable = halo.drafts.filter((d) => d.source === "halo" && (d.status === "draft" || d.status === "failed"));
  if (!halo.pages.length) return null;
  return (
    <div className="rounded-2xl border border-spark-rule bg-[#faf9f5] p-4">
      <p className="mb-2 text-sm font-semibold text-spark-ink">Also new on your sites</p>
      {halo.pages.map((p) => (
        <div key={p.id} className="border-t border-spark-rule py-2">
          <div className="flex items-center justify-between gap-2">
            <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-spark-ink hover:underline">{p.title || p.url}</a>
            {swappable.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPick(pick === p.id ? null : p.id)}>Use instead</Button>
            )}
          </div>
          {pick === p.id && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-spark-ink-muted">In place of:</span>
              {swappable.map((d) => (
                <button key={d.id} type="button" className="rounded-full border border-spark-rule bg-white px-2.5 py-1 text-xs text-spark-ink hover:border-spark-amber"
                  onClick={() => { setPick(null); void halo.useInstead(p.id, d.id); }}>
                  {when(d.slot_at)} · {(d.projects?.ai_script?.title || d.topic).slice(0, 40)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function HaloDrafts({ halo, needsVideo, onOutOfVideos }: {
  halo: Halo;
  /** Drafts past the videos left this month (2026-10-24). */
  needsVideo: Set<string>;
  onOutOfVideos: () => void;
}) {
  const { settings } = halo;
  // Sparklee's own requests have their own section (SparkleeDrafts).
  const drafts = halo.drafts.filter((d) => d.source !== "sparklee");
  const [showDone, setShowDone] = useState(false);
  if (!settings || (!drafts.length && !halo.pages.length)) return null;
  // Finished: posted, and (for a Halo post) on the post. They fold away once
  // newer cards are there, and stay open while they're all there is
  // (2026-10-26, the owner's ask).
  const isDone = (d: HaloDraft) => d.status === "posted" && (d.source !== "halo" || !!d.on_halo_at);
  const done = drafts.filter(isDone);
  const open = drafts.filter((d) => !isDone(d));
  const fold = done.length > 0 && open.length > 0;

  // "November · 3 of 4 planned": the month of the next Halo day.
  const halos = drafts.filter((d) => d.source === "halo");
  const next = halos.find((d) => Date.parse(d.slot_at) > Date.now()) ?? halos[halos.length - 1];
  const month = next ? new Date(next.slot_at) : new Date();
  const inMonth = halos.filter((d) => {
    const t = new Date(d.slot_at);
    return t.getMonth() === month.getMonth() && t.getFullYear() === month.getFullYear();
  }).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-spark-ink-faint">
          {drafts.some((d) => d.source === "email") ? "From your sites & emails" : "From your Halo sites"}
        </p>
        {halos.length > 0 && (
          <span className="text-[13px] font-medium text-spark-ink-muted">
            {month.toLocaleString(undefined, { month: "long" })} · {inMonth} of {settings.perMonth} planned
          </span>
        )}
      </div>
      {open.map((d) => <Card key={d.id} d={d} halo={halo} needsVideo={needsVideo.has(d.id)} onOutOfVideos={onOutOfVideos} />)}
      {fold && (
        <button type="button" onClick={() => setShowDone((x) => !x)}
          className="flex items-center justify-between rounded-2xl border border-spark-rule bg-[#faf9f5] px-4 py-3 text-left">
          <span className="text-sm font-semibold text-spark-ink">Done · {done.length} posted{done.some((d) => d.source === "halo") ? " and on your Halo posts" : ""}</span>
          <span className="text-[13px] font-semibold text-[#A3660F]">{showDone ? "Hide ▴" : "Show ▾"}</span>
        </button>
      )}
      {(!fold || showDone) && done.map((d) => <Card key={d.id} d={d} halo={halo} needsVideo={needsVideo.has(d.id)} onOutOfVideos={onOutOfVideos} />)}
      <AlsoNew halo={halo} />
    </div>
  );
}

/**
 * "From Sparklee" (2026-10-26, usability sweep #11): what was asked for with
 * Tell Sparklee, on AutoSparks and at the top of Create. The same cards as
 * Halo's: Watch, Edit thumbnail, Edit title and caption, Approve to post.
 */
export function SparkleeDrafts({ halo, needsVideo, onOutOfVideos, heading = true, onlyOpen = false, limit }: {
  halo: Halo;
  needsVideo: Set<string>;
  onOutOfVideos: () => void;
  heading?: boolean;
  /** Only the ones still to watch or approve (Create). */
  onlyOpen?: boolean;
  limit?: number;
}) {
  let list = halo.drafts.filter((d) => d.source === "sparklee");
  if (onlyOpen) list = list.filter((d) => d.status === "writing" || d.status === "draft" || d.status === "approved");
  list = [...list].sort((a, b) => Date.parse(b.slot_at) - Date.parse(a.slot_at));
  if (limit) list = list.slice(0, limit);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {heading && <p className="text-xs font-bold uppercase tracking-[.12em] text-spark-ink-faint">From Sparklee</p>}
      {list.map((d) => <Card key={d.id} d={d} halo={halo} needsVideo={needsVideo.has(d.id)} onOutOfVideos={onOutOfVideos} />)}
    </div>
  );
}
