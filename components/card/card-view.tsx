"use client";

import { useEffect, useRef } from "react";
import type { Card } from "@/lib/card/card";

/**
 * The public Video Business Card (2026-10-30, the owner's approved mockup):
 * the agent's intro, their details from Settings, tap-to-call/text/email,
 * Book a call, Save my contact, and the links they switched on, in their
 * brand colour. Opens and taps are counted, with nothing about the visitor.
 */

const withHttps = (u?: string | null) => (u ? (/^https?:\/\//i.test(u) ? u : `https://${u}`) : null);
const digits = (p: string) => p.replace(/[^\d+]/g, "");

export function CardView({ card, color, title }: { card: Card; color: string; title: string }) {
  const p = card.profile;
  const played = useRef(false);
  const send = (kind: string) => {
    try {
      const body = JSON.stringify({ kind });
      if (navigator.sendBeacon) navigator.sendBeacon(`/api/card/${card.slug}/event`, new Blob([body], { type: "application/json" }));
      else void fetch(`/api/card/${card.slug}/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    } catch { /* counting is best effort */ }
  };
  useEffect(() => { send("open"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const phone = p.mobile_phone || p.phone || p.company_phone;
  const area = [p.location_city, p.location_state].filter(Boolean).join(", ");
  const site = withHttps(p.website);
  const actions = [
    phone && { kind: "call", label: "Call", icon: "📞", href: `tel:${digits(phone)}` },
    phone && { kind: "text", label: "Text", icon: "💬", href: `sms:${digits(phone)}` },
    p.email && { kind: "email", label: "Email", icon: "✉️", href: `mailto:${p.email}` },
    site && { kind: "website", label: "Website", icon: "🌐", href: site },
  ].filter(Boolean) as { kind: string; label: string; icon: string; href: string }[];

  return (
    <main className="min-h-screen bg-[#f4f2ee] px-0 py-0 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-[440px] overflow-hidden bg-white sm:rounded-[28px] sm:shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
        {card.video ? (
          <video
            src={card.video.url}
            poster={card.video.poster ?? undefined}
            controls
            playsInline
            preload="metadata"
            onPlay={() => { if (!played.current) { played.current = true; send("play"); } }}
            className={`w-full bg-black ${card.video.vertical ? "max-h-[78vh] object-contain" : "aspect-video object-cover"}`}
          />
        ) : p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt={p.full_name ?? ""} className="aspect-square w-full object-cover" />
        ) : null}

        <div className="px-5 pb-2 pt-4 text-center">
          <h1 className="text-[24px] font-bold text-[#24221e]">{p.full_name || "Your agent"}</h1>
          <p className="mt-0.5 text-[14.5px] text-[#77736a]">{[title, area].filter(Boolean).join(" · ")}</p>
          {p.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.logo_url} alt={p.company_name ?? ""} className="mx-auto mt-2.5 max-h-[44px] max-w-[200px] object-contain" />
          ) : p.company_name ? (
            <span className="mt-2 inline-block rounded-md border-[1.5px] px-2 py-0.5 text-[13px] font-extrabold tracking-wide" style={{ color, borderColor: color }}>{p.company_name.toUpperCase()}</span>
          ) : null}
        </div>

        {actions.length > 0 && (
          <div className="grid gap-2 px-4 py-3" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
            {actions.map((a) => (
              <a key={a.kind} href={a.href} onClick={() => send(a.kind)} target={a.kind === "website" ? "_blank" : undefined} rel="noreferrer"
                className="flex flex-col items-center gap-1 text-[12.5px] font-semibold text-[#4a463e]">
                <span className="flex h-[48px] w-[48px] items-center justify-center rounded-full text-[20px] text-white" style={{ background: color }}>{a.icon}</span>
                {a.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 px-4 pb-2">
          {card.settings.bookingUrl && (
            <a href={card.settings.bookingUrl} target="_blank" rel="noreferrer" onClick={() => send("book")}
              className="block rounded-2xl py-3 text-center text-[16px] font-bold text-white" style={{ background: color }}>📅 Book a call</a>
          )}
          <a href={`/api/card/${card.slug}/vcard`}
            className="block rounded-2xl border-[1.5px] py-3 text-center text-[16px] font-bold" style={{ borderColor: color, color }}>👤 Save my contact</a>
        </div>

        <div className="px-4 pb-2 pt-1">
          {card.settings.homeValueUrl && (
            <a href={card.settings.homeValueUrl} target="_blank" rel="noreferrer" onClick={() => send("home_value")}
              className="mb-2 flex items-center gap-2.5 rounded-xl border border-[#e8e3d8] px-3 py-2.5 text-[15px] font-semibold text-[#24221e]">🏡 What&apos;s my home worth?<span className="ml-auto text-[#77736a]">→</span></a>
          )}
          {card.settings.showReviews !== false && p.google_review_url && (
            <a href={withHttps(p.google_review_url)!} target="_blank" rel="noreferrer" onClick={() => send("reviews")}
              className="mb-2 flex items-center gap-2.5 rounded-xl border border-[#e8e3d8] px-3 py-2.5 text-[15px] font-semibold text-[#24221e]">⭐ My Google reviews<span className="ml-auto text-[#77736a]">→</span></a>
          )}
          {card.settings.showYouTube !== false && p.youtube_channel_id && (
            <a href={`https://www.youtube.com/channel/${p.youtube_channel_id}`} target="_blank" rel="noreferrer" onClick={() => send("youtube")}
              className="mb-2 flex items-center gap-2.5 rounded-xl border border-[#e8e3d8] px-3 py-2.5 text-[15px] font-semibold text-[#24221e]">▶️ My YouTube channel<span className="ml-auto text-[#77736a]">→</span></a>
          )}
        </div>

        {p.license_number && <p className="px-4 text-center text-[11.5px] text-[#a29d92]">License {p.license_number}</p>}
        <p className="mt-3 border-t border-[#e8e3d8] py-3 text-center text-[11.5px] text-[#a29d92]">
          Made with <a href="https://www.sparkreels.ai" className="underline">SparkReels</a>
        </p>
      </div>
    </main>
  );
}
