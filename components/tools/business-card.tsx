"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Copy, Download, ExternalLink, Loader2, Mail, MessageSquare, QrCode, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Video Business Card (2026-10-30, the owner's approved mockup): set up the
 * card page, make the video card, and share both. Lives in Spark Tools under
 * Images & banners.
 */

interface Profile {
  full_name: string | null; company_name: string | null; email: string | null;
  phone: string | null; mobile_phone: string | null; company_phone: string | null;
  website: string | null; logo_url: string | null; avatar_url: string | null;
  location_city: string | null; location_state: string | null; google_review_url: string | null;
  youtube_channel_id: string | null; brand_colors: string[] | null;
}
interface Settings { title?: string; bookingUrl?: string; homeValueUrl?: string; showReviews?: boolean; showYouTube?: boolean; color?: string; videoId?: string | null }
interface Vid { id: string; title: string; thumbnail: string | null; vertical: boolean; intro: boolean; createdAt: string }
interface Data {
  slug: string; url: string; settings: Settings; profile: Profile;
  video: { id: string; url: string; poster: string | null; vertical: boolean; title: string } | null;
  videos: Vid[]; videoCardUrl: string | null; videoCardMadeAt: string | null; paid: boolean;
  stats: { opens: number; plays: number; taps: number; saves: number } | null;
}

const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14.5px]";
const label = "mb-1 block text-[13px] font-semibold text-spark-ink-soft";

export function BusinessCardTool() {
  const [d, setD] = useState<Data | null>(null);
  const [s, setS] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [making, setMaking] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/business-card").catch(() => null);
    if (!res?.ok) { toast.error("Couldn't open your card."); return; }
    const data = (await res.json()) as Data;
    setD(data); setS(data.settings ?? {});
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!d?.url) return;
    void import("qrcode").then((m) => m.default.toDataURL(d.url, { margin: 1, width: 600 })).then(setQr).catch(() => {});
  }, [d?.url]);

  async function save(next = s) {
    setSaving(true);
    try {
      const res = await fetch("/api/business-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: next }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't save your card."); return; }
      toast.success("Card saved.");
      await load();
    } finally { setSaving(false); }
  }

  async function makeVideoCard() {
    setMaking(true);
    try {
      const res = await fetch("/api/business-card/video", { method: "POST" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(out.error || "Couldn't make your video card."); return; }
      toast.success("Your video card is ready.");
      await load();
    } finally { setMaking(false); }
  }

  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); toast.success(`${what} copied.`); };

  if (!d) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-spark-amber" /></div>;

  const p = d.profile;
  const name = p.full_name || "Your name";
  const phone = p.mobile_phone || p.phone || p.company_phone;
  const color = s.color || p.brand_colors?.find((c) => /^#[0-9a-fA-F]{6}$/.test(c)) || "#1B5E82";
  const hasIntro = d.videos.some((v) => v.intro);
  const textBody = `Hi! Here's my video business card: ${d.url}`;
  const signature = `<table cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;font-size:14px;color:#24221e"><tr><td><b>${name}</b>${s.title || "REALTOR®" ? ` · ${s.title || "REALTOR®"}` : ""}${p.company_name ? `<br>${p.company_name}` : ""}${phone ? `<br>${phone}` : ""}<br><a href="${d.url}" style="color:${color};font-weight:bold">▶ Watch my 30-second intro</a></td></tr></table>`;

  return (
    <div>
      <h2 className="text-lg font-bold text-spark-ink">Video Business Card</h2>
      <p className="mb-4 text-sm text-spark-ink-muted">A short video card people can watch and share, and a card page with tap-to-call, Book a call and Save my contact.</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: the card */}
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-spark-rule bg-white p-4">
            <p className="mb-2 text-[15px] font-semibold text-spark-ink">Your video</p>
            {d.videos.length === 0 ? (
              <p className="text-[14px] text-spark-ink-muted">
                Make your Agent Intro first: a 30-second video introducing you.{" "}
                <Link href="/create?intro=1" className="font-semibold text-[#A3660F] underline">Make my Agent Intro</Link>
              </p>
            ) : (
              <>
                <select value={s.videoId ?? d.video?.id ?? ""} onChange={(e) => setS({ ...s, videoId: e.target.value || null })} className={input}>
                  {!d.video && <option value="">Pick a video</option>}
                  {d.videos.map((v) => (
                    <option key={v.id} value={v.id}>{v.intro ? "👋 Agent Intro · " : ""}{v.title} · {new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</option>
                  ))}
                </select>
                {!hasIntro && (
                  <p className="mt-1.5 text-[12.5px] text-spark-ink-muted">
                    Best with an Agent Intro. <Link href="/create?intro=1" className="font-semibold text-[#A3660F] underline">Make one</Link>
                  </p>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-spark-rule bg-white p-4">
            <p className="mb-2 text-[15px] font-semibold text-spark-ink">On your card</p>
            <div className="mb-3 rounded-xl bg-[#faf9f5] px-3 py-2 text-[13.5px] text-spark-ink-soft">
              <b className="text-spark-ink">{name}</b>{p.company_name ? ` · ${p.company_name}` : ""}<br />
              {[phone, p.email, p.website].filter(Boolean).join(" · ") || "Add your phone, email and website in Settings."}
              <Link href="/settings" className="ml-1 font-semibold text-[#A3660F] underline">Edit in Settings</Link>
            </div>
            <label className={label}>Title under your name</label>
            <input className={`${input} mb-3`} value={s.title ?? ""} placeholder="REALTOR®" onChange={(e) => setS({ ...s, title: e.target.value })} />
            <label className={label}>Book a call link <span className="font-normal text-spark-ink-faint">(optional)</span></label>
            <input className={`${input} mb-3`} value={s.bookingUrl ?? ""} placeholder="calendly.com/your-name" onChange={(e) => setS({ ...s, bookingUrl: e.target.value })} />
            <label className={label}>Home value page <span className="font-normal text-spark-ink-faint">(optional)</span></label>
            <input className={`${input} mb-3`} value={s.homeValueUrl ?? ""} placeholder="yoursite.com/home-value" onChange={(e) => setS({ ...s, homeValueUrl: e.target.value })} />
            <label className="mb-2 flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-4 w-4 accent-[#BA7517]" checked={s.showReviews !== false} onChange={(e) => setS({ ...s, showReviews: e.target.checked })} disabled={!p.google_review_url} />
              My Google reviews {!p.google_review_url && <span className="text-[12.5px] text-spark-ink-faint">(add your review link in Settings)</span>}
            </label>
            <label className="mb-3 flex items-center gap-2 text-[14px]">
              <input type="checkbox" className="h-4 w-4 accent-[#BA7517]" checked={s.showYouTube !== false} onChange={(e) => setS({ ...s, showYouTube: e.target.checked })} disabled={!p.youtube_channel_id} />
              My YouTube channel {!p.youtube_channel_id && <span className="text-[12.5px] text-spark-ink-faint">(connect YouTube in Settings)</span>}
            </label>
            <label className="mb-3 flex items-center gap-2 text-[14px]">
              Card colour <input type="color" value={color} onChange={(e) => setS({ ...s, color: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-spark-rule" />
            </label>
            <Button size="sm" onClick={() => void save()} loading={saving}>Save card</Button>
          </section>
        </div>

        {/* Right: share */}
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl border border-spark-rule bg-white p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[15px] font-semibold text-spark-ink"><Video size={16} /> Your video card</p>
            <p className="mb-3 text-[13px] text-spark-ink-muted">Your video with your name strip at the start and an end card with your phone, email, website and a QR code to your card page. Made from your video: nothing more from your plan.</p>
            {d.videoCardUrl ? (
              <>
                <video src={d.videoCardUrl} controls playsInline preload="metadata" className="mx-auto mb-3 max-h-[420px] w-auto rounded-xl bg-black" />
                <div className="flex flex-wrap gap-2">
                  <a href={d.videoCardUrl} download="video-business-card.mp4"><Button size="sm" variant="outline" className="gap-1.5"><Download size={13} /> Download MP4</Button></a>
                  <a href={`sms:?&body=${encodeURIComponent(textBody)}`}><Button size="sm" variant="outline" className="gap-1.5"><MessageSquare size={13} /> Text it</Button></a>
                  <Button size="sm" variant="outline" onClick={() => void makeVideoCard()} loading={making}>Make it again</Button>
                </div>
                {d.videoCardMadeAt && <p className="mt-2 text-[12px] text-spark-ink-faint">Made {new Date(d.videoCardMadeAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Make it again after you change your card.</p>}
              </>
            ) : (
              <Button onClick={() => void makeVideoCard()} loading={making} disabled={!d.video}>{making ? "Making your video card… about a minute" : "Make my video card"}</Button>
            )}
          </section>

          <section className="rounded-2xl border border-spark-rule bg-white p-4">
            <p className="mb-2 text-[15px] font-semibold text-spark-ink">Share your card</p>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-spark-rule bg-[#faf9f5] px-3 py-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate">{d.url.replace(/^https?:\/\//, "")}</span>
              <button type="button" onClick={() => copy(d.url, "Link")} className="flex items-center gap-1 font-semibold text-[#A3660F]"><Copy size={13} /> Copy</button>
              <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-[#A3660F]"><ExternalLink size={13} /> Open</a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={`sms:?&body=${encodeURIComponent(textBody)}`}><Button size="sm" variant="outline" className="w-full gap-1.5"><MessageSquare size={13} /> Text it</Button></a>
              <a href={`mailto:?subject=${encodeURIComponent(`${name} · my video business card`)}&body=${encodeURIComponent(textBody)}`}><Button size="sm" variant="outline" className="w-full gap-1.5"><Mail size={13} /> Email it</Button></a>
              {qr && <a href={qr} download="my-card-qr.png"><Button size="sm" variant="outline" className="w-full gap-1.5"><QrCode size={13} /> Download QR code</Button></a>}
              <Button size="sm" variant="outline" className="w-full" onClick={() => {
                try {
                  const item = new ClipboardItem({ "text/html": new Blob([signature], { type: "text/html" }), "text/plain": new Blob([`${name}\n${d.url}`], { type: "text/plain" }) });
                  void navigator.clipboard.write([item]).then(() => toast.success("Signature copied. Paste it into your email signature."));
                } catch { copy(d.url, "Link"); }
              }}>✍️ Copy email signature</Button>
            </div>
            {qr && (
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR code to your card" className="h-24 w-24 rounded-lg border border-spark-rule" />
                <p className="text-[13px] text-spark-ink-muted">Print it on paper cards, yard signs and open house sheets. It always opens your card, even after you change the video.</p>
              </div>
            )}
          </section>

          {d.paid && d.stats && (
            <section className="rounded-2xl border border-spark-rule bg-white p-4">
              <p className="mb-2 text-[15px] font-semibold text-spark-ink">Last 30 days</p>
              <div className="grid grid-cols-4 gap-2">
                {[["Opened", d.stats.opens], ["Watched", d.stats.plays], ["Tapped call, text, email or book", d.stats.taps], ["Saved your contact", d.stats.saves]].map(([l, n]) => (
                  <div key={l as string} className="rounded-xl bg-[#faf9f5] px-2.5 py-2">
                    <b className="block text-[19px]">{n}</b>
                    <span className="text-[11.5px] leading-tight text-spark-ink-muted">{l}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
