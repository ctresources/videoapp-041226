"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, CheckCircle, Link2Off, ExternalLink, Key,
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
  avatarUrl?: string;
  source?: "native" | "blotato";
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  youtube:   { label: "YouTube",   icon: PlayCircle, color: "text-red-500",    bg: "bg-red-50",    border: "border-red-100" },
  instagram: { label: "Instagram", icon: Camera,     color: "text-pink-500",   bg: "bg-pink-50",   border: "border-pink-100" },
  tiktok:    { label: "TikTok",    icon: Music2,     color: "text-slate-700",  bg: "bg-slate-100", border: "border-slate-200" },
  linkedin:  { label: "LinkedIn",  icon: AtSign,     color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-100" },
  twitter:   { label: "Twitter/X", icon: AtSign,     color: "text-sky-500",    bg: "bg-sky-50",    border: "border-sky-100" },
  facebook:  { label: "Facebook",  icon: Share2,     color: "text-blue-500",   bg: "bg-blue-50",   border: "border-blue-100" },
  threads:   { label: "Threads",   icon: Share2,     color: "text-slate-700",  bg: "bg-slate-100", border: "border-slate-200" },
  bluesky:   { label: "Bluesky",   icon: Globe,      color: "text-sky-400",    bg: "bg-sky-50",    border: "border-sky-100" },
  pinterest: { label: "Pinterest", icon: Globe,      color: "text-red-600",    bg: "bg-red-50",    border: "border-red-100" },
};

function SocialSettingsContent() {
  const searchParams = useSearchParams();

  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeChannel, setYoutubeChannel] = useState<SocialAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnectingYT, setDisconnectingYT] = useState(false);

  useEffect(() => {
    // Show toast based on OAuth redirect result
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
      const { accounts: data, connected, youtubeConnected: ytConnected } = await res.json();
      const all: SocialAccount[] = data || [];
      setAccounts(all.filter((a) => a.source !== "native"));
      setYoutubeConnected(!!ytConnected);
      setYoutubeChannel(all.find((a) => a.id === "native_youtube") ?? null);
      if (connected && all.some((a) => a.source === "blotato")) setSavedKey("••••••••••••••••");
    }
    setLoading(false);
  }

  async function handleSaveKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/social/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid key");
      setAccounts((data.accounts || []).map((a: SocialAccount) => ({ ...a, source: "blotato" })));
      setSavedKey("••••••••••••••••");
      setApiKey("");
      toast.success(`Connected! ${data.accounts?.length || 0} social accounts found.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to connect Blotato");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnectBlotato() {
    const res = await fetch("/api/social/accounts", { method: "DELETE" });
    if (res.ok) {
      setSavedKey(null);
      setAccounts([]);
      toast.success("Blotato disconnected");
    }
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

  async function handleRefresh() {
    setRefreshing(true);
    await loadAccounts();
    setRefreshing(false);
    toast.success("Accounts refreshed");
  }

  const isBlotato = !!savedKey;
  const blotatoAccounts = accounts.filter((a) => a.source !== "native");

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
          <p className="text-sm text-slate-500 mt-0.5">Connect once — post to YouTube and other platforms directly from the app</p>
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
                  <p className="text-xs text-slate-400 truncate">Channel ID: {youtubeChannel.username}</p>
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
            ) : (
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
                Requires <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> in your environment.{" "}
                Set these up in Google Cloud Console → YouTube Data API v3 → OAuth 2.0 credentials.
                Redirect URI: <code className="bg-slate-100 px-1 rounded">/api/auth/youtube/callback</code>
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Blotato (other platforms) ──────────────────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-secondary-50 rounded-xl flex items-center justify-center shrink-0">
            <Key size={20} className="text-secondary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-brand-text">Other Platforms (Blotato)</h3>
              {isBlotato && (
                <Badge variant="success" className="text-xs gap-1">
                  <CheckCircle size={11} /> Connected
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {isBlotato
                ? "Instagram, TikTok, LinkedIn and more are connected via Blotato."
                : "Enter your Blotato API key to connect Instagram, TikTok, LinkedIn, Facebook, and more."}
            </p>

            {isBlotato ? (
              <div className="flex items-center gap-3">
                <code className="text-sm bg-slate-100 px-3 py-1.5 rounded-lg text-slate-500 flex-1">{savedKey}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  loading={refreshing}
                  className="gap-1.5 shrink-0"
                >
                  <RefreshCw size={13} /> Refresh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDisconnectBlotato}
                  className="text-red-500 hover:bg-red-50 gap-1.5 shrink-0"
                >
                  <Link2Off size={13} /> Disconnect
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="blotato_api_key_xxxxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveKey()}
                  className="flex-1 font-mono text-sm"
                />
                <Button onClick={handleSaveKey} loading={saving} className="gap-1.5 shrink-0">
                  Connect
                </Button>
              </div>
            )}
          </div>
        </div>

        {!isBlotato && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-400">Get your API key from your Blotato account settings</p>
            <a
              href="https://app.blotato.com/settings"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-500 flex items-center gap-1 hover:underline"
            >
              Open Blotato <ExternalLink size={11} />
            </a>
          </div>
        )}
      </Card>

      {/* Connected Blotato accounts list */}
      {isBlotato && (
        <>
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm font-medium text-slate-600">
              {blotatoAccounts.length} connected channel{blotatoAccounts.length !== 1 ? "s" : ""}
            </p>
            <a
              href="https://app.blotato.com/accounts"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary-500 flex items-center gap-1 hover:underline"
            >
              Add more in Blotato <ExternalLink size={11} />
            </a>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : blotatoAccounts.length === 0 ? (
            <Card className="text-center py-10">
              <p className="text-sm text-slate-500 mb-2">No accounts found in Blotato yet</p>
              <a href="https://app.blotato.com/accounts" target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <ExternalLink size={13} /> Connect accounts in Blotato
                </Button>
              </a>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {blotatoAccounts.map((account) => {
                const meta = PLATFORM_META[account.platform.toLowerCase()] || PLATFORM_META.youtube;
                const Icon = meta.icon;
                return (
                  <Card
                    key={account.id}
                    padding="none"
                    className={`flex items-center gap-4 p-4 border ${meta.border} ${meta.bg}`}
                  >
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 border border-slate-100">
                      <Icon size={18} className={meta.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-brand-text">{meta.label}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {account.username ? `@${account.username}` : account.name}
                      </p>
                    </div>
                    <Badge variant="success" className="text-xs gap-1 shrink-0">
                      <CheckCircle size={11} /> Ready
                    </Badge>
                  </Card>
                );
              })}
            </div>
          )}
        </>
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
