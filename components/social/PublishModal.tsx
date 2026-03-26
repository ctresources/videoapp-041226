"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  X, Send, Calendar, CheckCircle, AlertTriangle, Link2, Clock,
  PlayCircle, Camera, Music2
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface SocialAccount {
  id: string;
  platform: string;
  platform_username: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface PublishModalProps {
  videoId: string;
  videoTitle: string;
  defaultCaption?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  instagramCaption?: string;
  onClose: () => void;
  onPublished?: () => void;
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  youtube: { label: "YouTube", icon: PlayCircle, color: "text-red-500", bg: "bg-red-50" },
  instagram: { label: "Instagram", icon: Camera, color: "text-pink-500", bg: "bg-pink-50" },
  tiktok: { label: "TikTok", icon: Music2, color: "text-slate-700", bg: "bg-slate-100" },
};

type Tab = "now" | "schedule";

export function PublishModal({
  videoId, videoTitle, defaultCaption = "", defaultDescription = "",
  defaultTags = [], instagramCaption = "", onClose, onPublished
}: PublishModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState(instagramCaption || defaultCaption);
  const [title, setTitle] = useState(videoTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [tab, setTab] = useState<Tab>("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [results, setResults] = useState<Record<string, { success: boolean; url?: string; error?: string }> | null>(null);

  useEffect(() => {
    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then(({ accounts: data }) => {
        setAccounts(data || []);
        // Auto-select all connected platforms
        setSelected((data || []).map((a: SocialAccount) => a.platform));
        setLoadingAccounts(false);
      });
  }, []);

  function togglePlatform(platform: string) {
    setSelected((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  }

  async function handlePublishNow() {
    if (!selected.length) return toast.error("Select at least one platform");
    setLoading(true);
    try {
      const res = await fetch("/api/social/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          platforms: selected,
          caption,
          title,
          description,
          tags: defaultTags,
          privacyStatus: privacy,
        }),
      });
      const data = await res.json();
      setResults(data.results);
      const success = Object.values(data.results as Record<string, { success: boolean }>).filter((r) => r.success).length;
      if (success > 0) {
        toast.success(`Published to ${success} platform${success > 1 ? "s" : ""}! 🚀`);
        onPublished?.();
      } else {
        toast.error("All posts failed. Check platform connections.");
      }
    } catch {
      toast.error("Failed to publish");
    } finally {
      setLoading(false);
    }
  }

  async function handleSchedule() {
    if (!selected.length) return toast.error("Select at least one platform");
    if (!scheduleDate) return toast.error("Pick a date");
    const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    setLoading(true);
    try {
      const res = await fetch("/api/social/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, platforms: selected, caption, scheduledAt }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()} 📅`);
      onPublished?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scheduling failed");
    } finally {
      setLoading(false);
    }
  }

  const hasYoutube = selected.includes("youtube");

  // Min date = tomorrow
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 0);
  const minDateStr = minDate.toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-brand-text">Publish Video</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">{videoTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {/* Results state */}
        {results ? (
          <div className="p-5">
            <div className="flex flex-col gap-3">
              {Object.entries(results).map(([platform, result]) => {
                const meta = PLATFORM_META[platform];
                const Icon = meta?.icon || Send;
                return (
                  <div key={platform} className={`flex items-center gap-3 p-3 rounded-xl ${result.success ? "bg-green-50" : "bg-red-50"}`}>
                    <Icon size={18} className={meta?.color || "text-slate-500"} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-brand-text">{meta?.label || platform}</p>
                      {result.success ? (
                        <p className="text-xs text-green-600">Published successfully!</p>
                      ) : (
                        <p className="text-xs text-red-500">{result.error}</p>
                      )}
                    </div>
                    {result.success ? (
                      <CheckCircle size={16} className="text-green-500" />
                    ) : (
                      <AlertTriangle size={16} className="text-red-400" />
                    )}
                    {result.url && (
                      <a href={result.url} target="_blank" rel="noreferrer" className="text-xs text-primary-500 hover:underline">
                        View →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            <Button onClick={onClose} className="w-full mt-4" variant="outline">Done</Button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {/* Platform selector */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Post to</p>
              {loadingAccounts ? (
                <div className="flex gap-2">
                  {[1,2,3].map((i) => <div key={i} className="h-12 w-24 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                  <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                  <p className="text-sm text-yellow-700">
                    No social accounts connected.{" "}
                    <Link href="/settings/social" className="underline font-medium" onClick={onClose}>
                      Connect now →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((account) => {
                    const meta = PLATFORM_META[account.platform];
                    const Icon = meta?.icon || Send;
                    const isSelected = selected.includes(account.platform);
                    return (
                      <button
                        key={account.id}
                        onClick={() => togglePlatform(account.platform)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-sm ${
                          isSelected
                            ? `border-primary-500 bg-primary-50`
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={15} className={meta?.color || "text-slate-500"} />
                        <span className="font-medium text-brand-text">{meta?.label}</span>
                        {isSelected && <CheckCircle size={13} className="text-primary-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tab: Now / Schedule */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              {(["now", "schedule"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    tab === t ? "bg-white shadow-sm text-brand-text" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t === "now" ? <Send size={14} /> : <Calendar size={14} />}
                  {t === "now" ? "Post Now" : "Schedule"}
                </button>
              ))}
            </div>

            {/* YouTube title & description */}
            {hasYoutube && (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">YouTube Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={100}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-slate-400 mt-0.5 text-right">{title.length}/100</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={5000}
                    rows={3}
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Privacy</label>
                  <select
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value as "public" | "unlisted" | "private")}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private (draft)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Instagram/TikTok caption */}
            {(selected.includes("instagram") || selected.includes("tiktok")) && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Caption <span className="text-slate-400">(Instagram / TikTok)</span>
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2200}
                  rows={3}
                  placeholder="Write your caption here, include hashtags..."
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
                <p className="text-xs text-slate-400 mt-0.5 text-right">{caption.length}/2200</p>
              </div>
            )}

            {/* Schedule datetime */}
            {tab === "schedule" && (
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-slate-500 block mb-1">Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    min={minDateStr}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="w-28">
                  <label className="text-xs font-medium text-slate-500 block mb-1">Time</label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            )}

            {/* Action button */}
            <Button
              onClick={tab === "now" ? handlePublishNow : handleSchedule}
              loading={loading}
              disabled={!selected.length || accounts.length === 0}
              size="lg"
              className="w-full gap-2"
            >
              {tab === "now" ? (
                <><Send size={16} /> Publish Now to {selected.length} Platform{selected.length !== 1 ? "s" : ""}</>
              ) : (
                <><Clock size={16} /> Schedule Post</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
