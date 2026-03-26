"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Link2, Link2Off, AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import toast from "react-hot-toast";
import Image from "next/image";

interface SocialAccount {
  id: string;
  platform: string;
  platform_username: string;
  avatar_url: string | null;
  is_active: boolean;
  token_expires_at: string | null;
}

const PLATFORMS = [
  {
    id: "youtube",
    name: "YouTube",
    icon: "/icons/youtube.svg",
    color: "#FF0000",
    bg: "bg-red-50",
    border: "border-red-100",
    description: "Post long-form & Shorts videos, blog videos",
    connectUrl: "/api/social/connect/youtube",
    requirements: "Requires a YouTube channel",
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "/icons/instagram.svg",
    color: "#E1306C",
    bg: "bg-pink-50",
    border: "border-pink-100",
    description: "Post Reels and video content",
    connectUrl: "/api/social/connect/instagram",
    requirements: "Requires Instagram Business or Creator account",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "/icons/tiktok.svg",
    color: "#010101",
    bg: "bg-slate-50",
    border: "border-slate-200",
    description: "Post short-form videos & Shorts",
    connectUrl: "/api/social/connect/tiktok",
    requirements: "Requires TikTok account with content posting access",
  },
] as const;

function SocialPageContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
    // Show connection result toasts from OAuth redirects
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) {
      toast.success(`${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully! 🎉`);
    }
    if (error) {
      const msg = error === "youtube_denied" ? "YouTube connection was denied"
        : error === "instagram_denied" ? "Instagram connection was denied"
        : error === "tiktok_denied" ? "TikTok connection was denied"
        : error;
      toast.error(msg);
    }
  }, []); // eslint-disable-line

  async function loadAccounts() {
    const res = await fetch("/api/social/accounts");
    if (res.ok) {
      const { accounts: data } = await res.json();
      setAccounts(data);
    }
    setLoading(false);
  }

  async function handleDisconnect(account: SocialAccount) {
    setDisconnecting(account.id);
    const res = await fetch("/api/social/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: account.id }),
    });
    if (res.ok) {
      setAccounts((a) => a.filter((acc) => acc.id !== account.id));
      toast.success(`${account.platform} disconnected`);
    } else {
      toast.error("Failed to disconnect account");
    }
    setDisconnecting(null);
  }

  function getAccount(platformId: string) {
    return accounts.find((a) => a.platform === platformId);
  }

  function isTokenExpiringSoon(expiresAt: string | null) {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // 7 days
  }

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
          <p className="text-sm text-slate-500 mt-0.5">Connect your channels to auto-post videos</p>
        </div>
      </div>

      {/* Connected count */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <CheckCircle size={16} className="text-accent-500" />
        <span className="text-sm text-slate-600">
          <span className="font-semibold text-brand-text">{accounts.length}</span> of {PLATFORMS.length} platforms connected
        </span>
      </div>

      {/* Platform cards */}
      <div className="flex flex-col gap-4">
        {PLATFORMS.map((platform) => {
          const account = getAccount(platform.id);
          const connected = !!account;
          const expiringSoon = connected && isTokenExpiringSoon(account?.token_expires_at || null);

          return (
            <Card key={platform.id} padding="none" className={`overflow-hidden border ${connected ? platform.border : "border-slate-200"}`}>
              <div className={`p-5 flex items-center gap-4 ${connected ? platform.bg : ""}`}>
                {/* Platform icon */}
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 border border-slate-100">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{ backgroundColor: platform.color }}
                  >
                    {platform.name[0]}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-brand-text">{platform.name}</h3>
                    {connected && (
                      <Badge variant="success" className="text-xs gap-1">
                        <CheckCircle size={11} /> Connected
                      </Badge>
                    )}
                    {expiringSoon && (
                      <Badge variant="warning" className="text-xs gap-1">
                        <AlertTriangle size={11} /> Token expiring
                      </Badge>
                    )}
                  </div>

                  {connected ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      {account?.avatar_url && (
                        <Image src={account.avatar_url} alt="" width={16} height={16} className="w-4 h-4 rounded-full" />
                      )}
                      <p className="text-sm text-slate-500 truncate">@{account?.platform_username}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 mt-0.5">{platform.description}</p>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {connected ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={disconnecting === account?.id}
                      onClick={() => account && handleDisconnect(account)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
                    >
                      <Link2Off size={14} /> Disconnect
                    </Button>
                  ) : (
                    <a href={platform.connectUrl}>
                      <Button size="sm" variant="outline" className="gap-1.5">
                        <Link2 size={14} /> Connect
                      </Button>
                    </a>
                  )}
                </div>
              </div>

              {/* Requirements note if not connected */}
              {!connected && (
                <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-xs text-slate-400">{platform.requirements}</p>
                  <a
                    href={platform.connectUrl}
                    className="text-xs text-primary-500 flex items-center gap-1 hover:underline"
                  >
                    Setup guide <ExternalLink size={11} />
                  </a>
                </div>
              )}

              {/* Token expiry warning */}
              {expiringSoon && connected && (
                <div className="px-5 py-2.5 bg-yellow-50 border-t border-yellow-100 flex items-center justify-between">
                  <p className="text-xs text-yellow-700">
                    Access token expires {new Date(account!.token_expires_at!).toLocaleDateString()} — reconnect to continue posting
                  </p>
                  <a href={platform.connectUrl}>
                    <Button size="sm" variant="ghost" className="text-xs h-6 text-yellow-700 hover:bg-yellow-100">
                      Reconnect
                    </Button>
                  </a>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Info box */}
      <div className="mt-6 bg-primary-50 border border-primary-100 rounded-2xl p-4">
        <p className="text-sm font-medium text-primary-700 mb-1">How auto-posting works</p>
        <p className="text-sm text-primary-600 leading-relaxed">
          Once connected, you can post or schedule any generated video directly to your channels from the <strong>My Videos</strong> page — no downloading or manual uploading required.
        </p>
      </div>
    </div>
  );
}

export default function SocialSettingsPage() {
  return (
    <Suspense fallback={<div className="animate-pulse space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 bg-slate-100 rounded-2xl" />)}</div>}>
      <SocialPageContent />
    </Suspense>
  );
}
