"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, CheckCircle, Link2Off, ExternalLink, Key,
  RefreshCw, PlayCircle, Camera, Music2,
  Share2, Globe, AtSign, AlertTriangle, Loader2, MapPin,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

interface SocialAccount {
  id: string;
  platform: string;
  name: string;
  username?: string;
  /** The real UC… channel id — native YouTube only. */
  channelId?: string | null;
  avatarUrl?: string;
  source?: "native" | "partner";
}

/** One of the platforms beyond YouTube, as /api/social/accounts describes it. */
interface MorePlatform {
  id: string;
  label: string;
  needs: string;
  connected: boolean;
  name: string | null;
  avatarUrl: string | null;
  needsReconnect: boolean;
}

interface MoreInfo {
  available: boolean;
  allowed: boolean;
  limit: number | null;
  platforms: MorePlatform[];
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  youtube:   { label: "YouTube",   icon: PlayCircle, color: "text-red-500",    bg: "bg-red-50",    border: "border-red-100" },
  instagram: { label: "Instagram", icon: Camera,     color: "text-pink-500",   bg: "bg-pink-50",   border: "border-pink-100" },
  tiktok:    { label: "TikTok",    icon: Music2,     color: "text-slate-700",  bg: "bg-slate-100", border: "border-slate-200" },
  linkedin:  { label: "LinkedIn",  icon: AtSign,     color: "text-spark-blue",   bg: "bg-spark-blue/10",   border: "border-spark-blue/20" },
  twitter:   { label: "Twitter/X", icon: AtSign,     color: "text-spark-blue",    bg: "bg-spark-blue/10",    border: "border-spark-blue/20" },
  facebook:  { label: "Facebook",  icon: Share2,     color: "text-spark-blue",   bg: "bg-spark-blue/10",   border: "border-spark-blue/20" },
  threads:   { label: "Threads",   icon: Share2,     color: "text-slate-700",  bg: "bg-slate-100", border: "border-slate-200" },
  bluesky:   { label: "Bluesky",   icon: Globe,      color: "text-spark-blue",    bg: "bg-spark-blue/10",    border: "border-spark-blue/20" },
  pinterest: { label: "Pinterest", icon: Globe,      color: "text-red-600",    bg: "bg-red-50",    border: "border-red-100" },
  x:         { label: "X",         icon: AtSign,     color: "text-slate-700",  bg: "bg-slate-100", border: "border-slate-200" },
  google_business: { label: "Google Business", icon: MapPin, color: "text-spark-blue", bg: "bg-spark-blue/10", border: "border-spark-blue/20" },
};

function SocialSettingsContent() {
  const searchParams = useSearchParams();

  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState<SocialAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnectingYT, setDisconnectingYT] = useState(false);
  const [more, setMore] = useState<MoreInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingAll, setDisconnectingAll] = useState(false);

  useEffect(() => {
    // Show toast based on OAuth redirect result
    const ytParam = searchParams.get("youtube");
    const ytError = searchParams.get("youtube_error");
    if (ytParam === "connected") toast.success("YouTube channel connected!");
    if (ytError) toast.error(`YouTube error: ${ytError}`);
    // Back from the connect page. The list below is read fresh, so it already
    // shows whatever was just connected or removed.
    if (searchParams.get("accounts") === "updated") toast.success("Your accounts are up to date.");
    loadAccounts();
  }, []); // eslint-disable-line

  async function loadAccounts() {
    setLoading(true);
    const res = await fetch("/api/social/accounts");
    if (res.ok) {
      const { accounts: data, youtubeConnected: ytConnected, more: moreInfo } = await res.json();
      const all: SocialAccount[] = data || [];
      setMore(moreInfo ?? null);
      setYoutubeConnected(!!ytConnected);
      setYoutubeChannel(all.find((a) => a.id === "native_youtube") ?? null);
    }
    setLoading(false);
  }

  async function handleDisconnectYouTube() {
    setDisconnectingYT(true);
    try {
      const res = await fetch("/api/auth/youtube", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disconnect");
      setYoutubeConnected(false);
      setYoutubeChannel(null);
      toast.success("YouTube disconnected");
    } catch {
      toast.error("Failed to disconnect YouTube");
    } finally {
      setDisconnectingYT(false);
    }
  }

  // Opens the page where accounts are connected. It is a full navigation, not a
  // pop-up: each platform's own sign-in opens from there, and pop-up blockers
  // eat the second window.
  async function handleConnectMore() {
    setConnecting(true);
    try {
      const res = await fetch("/api/social/connect", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn't open the connect page.");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the connect page.");
      setConnecting(false);
    }
  }

  async function handleDisconnectAll() {
    if (!window.confirm("Disconnect every platform below? YouTube stays connected. You can connect them again any time.")) return;
    setDisconnectingAll(true);
    try {
      const res = await fetch("/api/social/connect", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't disconnect.");
      toast.success("Disconnected.");
      await loadAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't disconnect.");
    } finally {
      setDisconnectingAll(false);
    }
  }

  const connectedCount = more?.platforms.filter((p) => p.connected).length ?? 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <button className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-slate-400" />
          </button>
        </Link>
        <div>
          <h2 className="text-xl font-bold text-brand-text">Social Accounts</h2>
          <p className="text-sm text-slate-500 mt-0.5">Connect your accounts once and publish to them straight from SparkReels</p>
        </div>
      </div>

      {/* ── Native YouTube ───────────────────────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center shrink-0">
            <PlayCircle size={22} className="text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-brand-text">YouTube</h3>
              {youtubeConnected && (
                <Badge variant="success" className="text-xs gap-1">
                  <CheckCircle size={11} /> Connected
                </Badge>
              )}
            </div>

            {youtubeConnected && youtubeChannel ? (
              <div className="flex items-center gap-3">
                {youtubeChannel.avatarUrl && (
                  <img
                    src={youtubeChannel.avatarUrl}
                    alt="channel"
                    className="w-8 h-8 rounded-full border border-slate-200"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-brand-text truncate">{youtubeChannel.name}</p>
                  {youtubeChannel.channelId && (
                    <p className="text-xs text-slate-400 truncate font-mono">{youtubeChannel.channelId}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectYouTube}
                  disabled={disconnectingYT}
                  className="text-red-500 hover:bg-red-50 gap-1.5 shrink-0"
                >
                  {disconnectingYT ? <Loader2 size={13} className="animate-spin" /> : <Link2Off size={13} />}
                  Disconnect
                </Button>
              </div>
            ) : null}

            {/* Surfaced at connect time, not after the first publish comes back
                without a thumbnail. YouTube only accepts custom thumbnails on
                phone-verified channels, it is per channel, and only the channel's
                owner can do it — so the app can never do this for them. Shown to
                everyone because there is no API telling us who has verified. */}
            {youtubeConnected && youtubeChannel && (
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500">
                  For thumbnails to be added to your videos automatically, YouTube needs this channel
                  phone-verified.{" "}
                  <a
                    href="https://www.youtube.com/verify"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-500 hover:underline font-medium"
                  >
                    Verify your channel
                  </a>{" "}
                  — make sure you&apos;re switched to this channel first. Without it your videos still
                  publish; you just set the thumbnail yourself.
                </p>
              </div>
            )}

            {!youtubeConnected && (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Connect your YouTube channel to publish videos directly — no third-party tools required.
                </p>
                <a href="/api/auth/youtube">
                  <Button className="gap-2">
                    <PlayCircle size={15} /> Connect YouTube Channel
                  </Button>
                </a>
              </>
            )}
          </div>
        </div>

        {!youtubeConnected && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
              <span>
                {/* Was the Google Cloud Console setup instructions — developer
                    text shown to every customer, naming environment variables
                    no agent can reach. */}
                Connecting opens Google so you can choose which channel to publish to. We never see
                your Google password, and you can disconnect at any time.
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Other platforms ─────────────────────────────────────────────────────
          "Coming soon" until the publishing service is switched on for this
          deployment; the connect section after that. */}
      {!more?.available ? (
        <Card className="mb-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-secondary-50 rounded-xl flex items-center justify-center shrink-0">
              <Key size={20} className="text-secondary-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-brand-text">Other Platforms</h3>
                <Badge variant="default" className="text-xs">Coming soon</Badge>
              </div>
              <p className="text-sm text-slate-500">
                Instagram, TikTok, LinkedIn, Facebook and more are on the way. YouTube publishes
                from here today.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="font-semibold text-brand-text">More platforms</h3>
            {connectedCount > 0 && (
              <Badge variant="success" className="text-xs gap-1">
                <CheckCircle size={11} /> {connectedCount} connected
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mb-4">
            {!more.allowed
              ? "Posting to these comes with a paid plan."
              : more.limit
                ? `Connect as many as you like. Your plan posts each video to YouTube plus ${more.limit} of these.`
                : "Connect as many as you like. Your plan posts each video to all of them."}
            {" "}You approve every post before it goes out.
          </p>

          <div className="space-y-2 mb-4">
            {more.platforms.map((pl) => {
              const meta = PLATFORM_META[pl.id] || PLATFORM_META.youtube;
              const Icon = meta.icon;
              return (
                <div key={pl.id} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${pl.connected ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50"}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
                    <Icon size={16} className={meta.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-brand-text">{pl.label}</p>
                      {pl.connected && !pl.needsReconnect && (
                        <span className="text-xs text-green-700 truncate">{pl.name || "Connected"}</span>
                      )}
                      {pl.needsReconnect && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle size={11} /> Needs reconnecting
                        </span>
                      )}
                    </div>
                    {/* What the account has to be, said before connecting.
                        Most agents' Instagram and Facebook are personal
                        accounts, and neither can be posted to. */}
                    {(!pl.connected || pl.needsReconnect) && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pl.needsReconnect ? "Its sign-in expired. Connect it again to keep posting there." : pl.needs}
                      </p>
                    )}
                  </div>
                  {pl.connected && !pl.needsReconnect && <CheckCircle size={15} className="text-green-600 shrink-0 mt-1" />}
                </div>
              );
            })}
          </div>

          {more.allowed ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleConnectMore} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                {connectedCount > 0 ? "Add or reconnect accounts" : "Connect accounts"}
              </Button>
              {connectedCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectAll}
                  disabled={disconnectingAll}
                  className="text-red-500 hover:bg-red-50 gap-1.5"
                >
                  {disconnectingAll ? <Loader2 size={13} className="animate-spin" /> : <Link2Off size={13} />}
                  Disconnect all
                </Button>
              )}
            </div>
          ) : (
            <Link href="/billing">
              <Button className="gap-2">See plans</Button>
            </Link>
          )}

          {more.allowed && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-400">
              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-400" />
              {/* Said up front: each platform's approval screen names the
                  service that delivers the posts, not SparkReels, and an
                  unfamiliar name on a permission screen is where people stop. */}
              <span>
                You&apos;ll choose your accounts on a SparkReels page. Each platform then asks you to approve
                our publishing partner, the service that delivers your posts. That&apos;s expected. We never
                see your passwords, and you can disconnect at any time.
              </span>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}

export default function SocialSettingsPage() {
  return (
    <Suspense>
      <SocialSettingsContent />
    </Suspense>
  );
}
