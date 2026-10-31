"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, ClipboardCopy, Copy, Globe, Loader2, MessageSquare, X } from "lucide-react";
import toast from "react-hot-toast";
import { haloNewMessage, haloSmsHref, haloUpdateMessage } from "@/lib/website/send";

/**
 * Send to Website (2026-10-31, the owner's approved mockup).
 *
 * One button on the Share Kit and on My Sparks opens this sheet: pick where,
 * then either text Halo (the agent's Halo site) or copy it for any other site.
 * For agents without Halo, an optional Get Halo offer that never stands in
 * the way. Works for blog only, video only, and both: only what the Spark has
 * is offered.
 *
 * Copy, Text Halo and Save never say "published". It's on a website only when
 * the agent pastes the post's address, or SparkReels finds the video on the
 * Halo page (GET /api/website/send looks each time this opens).
 */

interface Info {
  title: string;
  hasArticle: boolean;
  hasVideo: boolean;
  html: string;
  videoHtml: string;
  text: string;
  youtubeUrl: string | null;
  videoUrl: string | null;
  halo: { phone: string; posts: { title: string; url: string }[]; source: { title: string; url: string } | null } | null;
  haloSent: { postUrl: string; at: string; onPostAt: string | null } | null;
  postedUrl: string;
}
type GetHalo = { url: string | null; code: string | null; sms: string | null; referrer: boolean };

const btn = "inline-flex items-center gap-1.5 rounded-xl border border-spark-rule bg-white px-3.5 py-2 text-[14px] font-semibold text-spark-ink hover:border-spark-amber disabled:opacity-50";
const gold = "inline-flex items-center gap-1.5 rounded-xl bg-spark-amber px-3.5 py-2 text-[14px] font-bold text-white hover:opacity-90 disabled:opacity-50";
const field = "w-full rounded-xl border border-spark-rule bg-white px-3 py-2 text-[14px] text-spark-ink outline-none focus:border-spark-amber";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} copied.`); }
  catch { toast.error("Couldn't copy. Try again."); }
}

/** The button. Put it anywhere a Spark has a project. */
export function SendToWebsiteButton({ projectId, className }: { projectId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={className ?? "flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink transition-colors hover:border-spark-amber hover:text-spark-amber"}>
        <Globe size={12} /> Send to Website
      </button>
      {open && <SendToWebsite projectId={projectId} onClose={() => setOpen(false)} />}
    </>
  );
}

export function SendToWebsite({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState(false);
  const [where, setWhere] = useState<"choose" | "halo" | "other">("choose");
  const [getHalo, setGetHalo] = useState<GetHalo | null>(null);

  useEffect(() => {
    fetch(`/api/website/send?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Info) => setInfo(d))
      .catch(() => setFailed(true));
  }, [projectId]);

  // Get Halo goes where Settings' Get Halo goes: the referring Halo affiliate's
  // link, else the owner's (lib/halo/get-halo.ts). Only without a Halo site.
  useEffect(() => {
    if (!info || info.halo) return;
    fetch("/api/halo/get-link").then((r) => (r.ok ? r.json() : null)).then((d) => d && setGetHalo(d)).catch(() => {});
  }, [info]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Send to Website" onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[20px] bg-white p-4 shadow-xl sm:max-w-[520px] sm:rounded-[20px] sm:p-5">
        {where !== "choose" && (
          <button type="button" onClick={() => setWhere("choose")} className="mb-1.5 flex items-center gap-1 text-[13.5px] font-bold text-[#A3660F]">
            <ArrowLeft size={14} /> Back
          </button>
        )}
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[19px] font-bold text-spark-ink">
            {where === "halo" ? "Send to my Halo website" : where === "other" ? "Send to another website" : "Send to Website"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-spark-ink-muted hover:text-spark-ink"><X size={18} /></button>
        </div>

        {!info && !failed && <p className="flex items-center gap-2 py-8 text-[14px] text-spark-ink-muted"><Loader2 size={16} className="animate-spin" /> Getting it ready…</p>}
        {failed && <p className="py-6 text-[14px] text-red-600">Couldn&apos;t load this Spark. Close and try again.</p>}

        {info && where === "choose" && (
          <>
            <div className="mb-3 mt-2 flex flex-wrap gap-1.5">
              {[["Article", info.hasArticle], ["YouTube link", !!info.youtubeUrl], ["Video file", info.hasVideo]].map(([label, on]) => (
                <span key={label as string} className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold ${on ? "bg-[#e8f5ee] text-[#0f7a52]" : "bg-[#f1efe9] text-spark-ink-muted"}`}>
                  {on ? "✓" : "–"} {label as string}
                </span>
              ))}
            </div>
            {!info.hasArticle && !info.hasVideo ? (
              <p className="rounded-xl bg-[#faf9f5] px-3 py-2.5 text-[14px] text-spark-ink-soft">Nothing to send yet. Write the article or make the video first.</p>
            ) : (
              <>
                {info.halo && (
                  <Option icon="🌐" title="My Halo website" sub="Text Halo to add it to your site" onClick={() => setWhere("halo")} />
                )}
                <Option icon="📋" title="Another website" sub="Copy it, then paste it into your site's editor" onClick={() => setWhere("other")} />
              </>
            )}
            {!info.halo && getHalo && (
              <div className="mt-1 rounded-2xl border-[1.5px] border-dashed border-spark-rule p-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="min-w-[180px] flex-1 text-[14px] text-spark-ink">
                    <b>Need a website for your blogs and videos?</b> Explore an AI-powered website with Halo.
                  </p>
                  <a
                    href={getHalo.url ?? getHalo.sms ?? "#"}
                    {...(getHalo.url && { target: "_blank", rel: "noopener noreferrer" })}
                    onClick={() => { try { navigator.sendBeacon("/api/halo/get-link"); } catch { void fetch("/api/halo/get-link", { method: "POST", keepalive: true }); } }}
                    className={btn}
                  >
                    Get Halo →
                  </a>
                </div>
                <p className="mt-1.5 text-[12px] text-[#a29d92]">
                  Halo is $99/month, billed by Halo. {getHalo.referrer ? "The person who referred you" : "SparkReels"} may earn a referral fee.
                </p>
              </div>
            )}
          </>
        )}

        {info && where === "halo" && info.halo && <HaloSend info={info} projectId={projectId} onSent={(s) => setInfo({ ...info, haloSent: s })} />}
        {info && where === "other" && <OtherSite info={info} projectId={projectId} onSaved={(u) => setInfo({ ...info, postedUrl: u })} />}
      </div>
    </div>
  );
}

function Option({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mb-2 flex w-full items-start gap-3 rounded-2xl border-[1.5px] border-spark-rule p-3 text-left hover:border-spark-amber hover:bg-[#fbf3e4]">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#f1efe9] text-[19px]">{icon}</span>
      <span>
        <b className="block text-[15.5px] text-spark-ink">{title}</b>
        <span className="text-[13.5px] text-spark-ink-muted">{sub}</span>
      </span>
    </button>
  );
}

function HaloSend({ info, projectId, onSent }: { info: Info; projectId: string; onSent: (s: Info["haloSent"]) => void }) {
  const halo = info.halo!;
  const [mode, setMode] = useState<"update" | "new">(halo.posts.length ? "update" : "new");
  const [postUrl, setPostUrl] = useState(halo.source?.url ?? halo.posts[0]?.url ?? "");
  const [link, setLink] = useState(info.youtubeUrl ?? info.videoUrl ?? "");
  const post = halo.posts.find((p) => p.url === postUrl);
  const message = mode === "update"
    ? haloUpdateMessage({ title: post?.title ?? info.title, postUrl, link: info.hasVideo ? link : null })
    : haloNewMessage({ title: info.title, link: info.hasVideo ? link : null, hasArticle: info.hasArticle });
  const needsArticle = info.hasArticle && (mode === "new" || !info.hasVideo);
  const sent = info.haloSent;

  function remember() {
    if (mode !== "update" || !postUrl) return;
    const at = new Date().toISOString();
    void fetch("/api/website/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, action: "halo", postUrl }), keepalive: true });
    onSent({ postUrl, at, onPostAt: null });
  }

  return (
    <div className="mt-2">
      {sent && (
        <p className={`mb-2.5 rounded-xl px-3 py-2 text-[13.5px] ${sent.onPostAt ? "bg-[#e8f5ee] text-[#0f7a52]" : "bg-[#faf9f5] text-spark-ink-soft"}`}>
          {sent.onPostAt
            ? <><Check size={14} className="mr-1 inline" />On your Halo post since {day(sent.onPostAt)}.</>
            : <>Texted Halo on {day(sent.at)}. The video isn&apos;t on that page yet.</>}
        </p>
      )}
      <div className="mb-2.5 flex gap-1.5">
        {(["update", "new"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} disabled={m === "update" && !halo.posts.length}
            className={`flex-1 rounded-xl border-[1.5px] px-2 py-2 text-[14px] font-semibold disabled:opacity-40 ${mode === m ? "border-spark-amber bg-[#fbf3e4] text-[#A3660F]" : "border-spark-rule text-spark-ink"}`}>
            {m === "update" ? "Update a post" : "New post"}
          </button>
        ))}
      </div>

      {mode === "update" && (
        <>
          <label className="mb-1 block text-[12.5px] font-bold text-spark-ink-soft">Which post</label>
          <select value={postUrl} onChange={(e) => setPostUrl(e.target.value)} className={field}>
            {halo.posts.map((p) => <option key={p.url} value={p.url}>{p.title}</option>)}
          </select>
          {halo.source && postUrl === halo.source.url && <p className="mt-1 text-[12px] text-[#a29d92]">The post this video was made from.</p>}
        </>
      )}

      {info.hasVideo && (
        <>
          <label className="mb-1 mt-2.5 block text-[12.5px] font-bold text-spark-ink-soft">Video link</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} className={field} placeholder="Paste the YouTube link of the video you posted" />
          {!info.youtubeUrl && <p className="mt-1 text-[12px] text-[#a29d92]">Not on YouTube from SparkReels yet, so this is the video file. A YouTube link plays better on a website.</p>}
        </>
      )}

      <p className="mt-3 rounded-xl border-[1.5px] border-spark-blue bg-[#f6fafc] p-2.5 text-[14px] leading-relaxed text-spark-ink">{message}</p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {needsArticle && (
          <button type="button" className={btn} onClick={() => void copy(info.text, "Article")}><ClipboardCopy size={14} /> 1 · Copy article</button>
        )}
        <a href={haloSmsHref(halo.phone, message)} onClick={remember}
          className="inline-flex items-center gap-1.5 rounded-xl bg-spark-blue px-3.5 py-2 text-[14px] font-bold text-white hover:opacity-90">
          <MessageSquare size={14} /> {needsArticle ? "2 · Text Halo" : "Text Halo"}
        </a>
        <button type="button" className={btn} onClick={() => { void copy(message, "Message"); remember(); }}><Copy size={14} /> Copy message</button>
      </div>
      {needsArticle && <p className="mt-1.5 text-[12.5px] text-spark-ink-muted">After the message, paste the article into the same text.</p>}

      <p className="mt-3 rounded-xl bg-[#faf9f5] px-3 py-2 text-[13px] text-spark-ink-soft">
        This only sends Halo a text. Halo texts you back when it&apos;s done.
        {mode === "update" && info.hasVideo && " Open this again any time: it shows ✓ On your Halo post once the video is on that page."}
      </p>
    </div>
  );
}

function OtherSite({ info, projectId, onSaved }: { info: Info; projectId: string; onSaved: (url: string) => void }) {
  const [url, setUrl] = useState(info.postedUrl);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/website/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, action: "posted", url }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't save it."); return; }
      onSaved(out.url ?? ""); setUrl(out.url ?? "");
      toast.success(out.url ? "Saved the post's address." : "Cleared.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {info.hasArticle ? (
          <>
            <button type="button" className={gold} onClick={() => void copy(info.html, "Article HTML")}><Copy size={14} /> Copy as HTML</button>
            <button type="button" className={btn} onClick={() => void copy(info.text, "Article")}><Copy size={14} /> Copy as text</button>
          </>
        ) : (
          <button type="button" className={gold} onClick={() => void copy(info.videoHtml, "Video HTML")}><Copy size={14} /> Copy video HTML</button>
        )}
      </div>
      <p className="mt-1.5 text-[12.5px] text-[#a29d92]">
        {info.hasArticle
          ? `The headline, article, FAQs and search info${info.hasVideo ? ", with your video under the headline" : ""}.`
          : "Your video's player, ready to paste into a page."}
      </p>

      {(info.youtubeUrl || info.videoUrl) && (
        <>
          <p className="mb-1 mt-3 text-[12.5px] font-bold text-spark-ink-soft">Video links</p>
          {[["YouTube", info.youtubeUrl], ["Video file", info.videoUrl]].filter(([, v]) => v).map(([label, v]) => (
            <div key={label as string} className="mb-1.5 flex items-center gap-2 rounded-xl border border-spark-rule px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-spark-ink"><b>{label as string}:</b> {v as string}</span>
              <button type="button" onClick={() => void copy(v as string, `${label as string} link`)} className="shrink-0 text-[13px] font-bold text-[#A3660F]">Copy</button>
            </div>
          ))}
        </>
      )}

      <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-[13.5px] text-spark-ink-soft">
        <li>Add a new blog post on your website.</li>
        <li>Paste it in the post&apos;s HTML or code view.</li>
        <li>Publish it there.</li>
      </ol>

      <label className="mb-1 mt-3 block text-[12.5px] font-bold text-spark-ink-soft">Posted it? Paste the post&apos;s address</label>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yoursite.com/blog/…" className={field} />
        <button type="button" onClick={() => void save()} disabled={saving || url.trim() === info.postedUrl} className={btn}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-[#a29d92]">Saved with this Spark, so its email links to it. SparkReels doesn&apos;t post to other websites for you.</p>
    </div>
  );
}
