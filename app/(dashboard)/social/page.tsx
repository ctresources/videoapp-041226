"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, Link2Off, ExternalLink, Key,
  RefreshCw, PlayCircle, Camera, Music2,
  Share2, Globe, AtSign, AlertTriangle, Loader2,
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
  source?: "native";
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
};

function SocialPageContent() {
  const searchParams = useSearchParams();

  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState<SocialAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnectingYT, setDisconnectingYT] = useState(false);

  useEffect(() => {
    const ytParam = searchParams.get("youtube");
    const ytError = searchParams.get("youtube_error");
    if (ytParam === "connected") toast.success("YouTube channel connected!");
    if (ytError) toast.error(`YouTube error: ${ytError}`);
    loadAccounts();
  }, []); // eslint-disable-line

  async function loadAccounts() {
    setLoading(true);
    const res = await fetch("/api/social/accounts");
    if (res.ok) {
      const { accounts: data, youtubeConnected: ytConnected } = await res.json();
      const all: SocialAccount[] = data || [];
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

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <p className="text-sm text-slate-500">Connect your YouTube channel once and publish to it straight from SparkReels</p>
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

      {/* ── Other platforms — not wired up yet ─────────────────────────────────────── */}
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

      <p className="text-xs text-slate-400 text-center mt-6">
        Also accessible from{" "}
        <Link href="/settings/social" className="text-primary-500 hover:underline">
          Settings → Social Accounts
        </Link>
      </p>
    </div>
  );
}

export default function SocialPage() {
  return (
    <Suspense>
      <SocialPageContent />
    </Suspense>
  );
}
