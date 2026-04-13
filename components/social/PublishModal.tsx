"use client";

import { Button } from "@/components/ui/button";
import {
  X, Send, Calendar, CheckCircle, AlertTriangle, Clock,
  PlayCircle, Camera, Music2, Share2, Globe, AtSign
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface BlotatoAccount {
  id: string;
  platform: string;
  name: string;
  username?: string;
}

interface PublishModalProps {
  videoId: string;
  videoTitle: string;
  defaultCaption?: string;
  defaultDescription?: string;
  defaultTags?: string[];
  onClose: () => void;
  onPublished?: () => void;
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  youtube:   { label: "YouTube",   icon: PlayCircle, color: "text-red-500" },
  instagram: { label: "Instagram", icon: Camera,     color: "text-pink-500" },
  tiktok:    { label: "TikTok",    icon: Music2,     color: "text-slate-700" },
  linkedin:  { label: "LinkedIn",  icon: AtSign,     color: "text-blue-600" },
  twitter:   { label: "Twitter/X", icon: AtSign,     color: "text-sky-500" },
  facebook:  { label: "Facebook",  icon: Share2,     color: "text-blue-500" },
  threads:   { label: "Threads",   icon: Share2,     color: "text-slate-700" },
  bluesky:   { label: "Bluesky",   icon: Globe,      color: "text-sky-400" },
  pinterest: { label: "Pinterest", icon: Globe,      color: "text-red-600" },
};

type Tab = "now" | "schedule";

export function PublishModal({
  videoId, videoTitle, defaultCaption = "", defaultDescription = "",
  defaultTags = [], onClose, onPublished
}: PublishModalProps) {
  const [accounts, setAccounts] = useState<BlotatoAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [caption, setCaption] = useState(defaultCaption);
  const [title, setTitle] = useState(videoTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [tab, setTab] = useState<Tab>("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then(({ accounts: data }) => {
        const accs = data || [];
        setAccounts(accs);
        setSelectedIds(accs.map((a: BlotatoAccount) => a.id));
        setLoadingAccounts(false);
      });
  }, []);

  function toggleAccount(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  async function handleSubmit() {
    if (!selectedIds.length) return toast.error("Select at least one account");

    const scheduledAt = tab === "schedule" && scheduleDate
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : undefined;

    if (tab === "schedule" && !scheduleDate) return toast.error("Pick a date");

    setLoading(true);
    try {
      const targets = accounts
        .filter((a) => selectedIds.includes(a.id))
        .map((a) => ({
          accountId: a.id,
          platform: a.platform.toLowerCase(),
          caption,
          title,
          description,
          privacy,
        }));

      const res = await fetch("/api/social/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, targets, scheduledAt }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");

      setPosted(true);
      if (scheduledAt) {
        toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()} 📅`);
      } else {
        toast.success(`Published to ${selectedIds.length} platform${selectedIds.length > 1 ? "s" : ""}! 🚀`);
      }
      onPublished?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Post failed");
    } finally {
      setLoading(false);
    }
  }

  const hasYoutube = accounts.some((a) => selectedIds.includes(a.id) && a.platform.toLowerCase() === "youtube");
  const minDate = new Date().toISOString().split("T")[0];

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

        {posted ? (
          <div className="p-6 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <p className="font-semibold text-brand-text">
              {tab === "schedule" ? "Post Scheduled!" : "Published Successfully!"}
            </p>
            <p className="text-sm text-slate-500">
              {tab === "schedule"
                ? `Your video will be posted on ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString()}`
                : "Your video is live on the selected platforms."}
            </p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {/* Account selector */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Post to</p>
              {loadingAccounts ? (
                <div className="flex gap-2 flex-wrap">
                  {[1,2,3].map((i) => <div key={i} className="h-10 w-28 bg-slate-100 rounded-xl animate-pulse" />)}
                </div>
              ) : accounts.length === 0 ? (
                <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                  <AlertTriangle size={16} className="text-yellow-500 shrink-0" />
                  <p className="text-sm text-yellow-700">
                    No social accounts connected.{" "}
                    <Link href="/settings/social" className="underline font-medium" onClick={onClose}>
                      Connect Blotato →
                    </Link>
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {accounts.map((account) => {
                    const platform = account.platform.toLowerCase();
                    const meta = PLATFORM_META[platform] || PLATFORM_META.youtube;
                    const Icon = meta.icon;
                    const isSelected = selectedIds.includes(account.id);
                    return (
                      <button
                        key={account.id}
                        onClick={() => toggleAccount(account.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all text-sm ${
                          isSelected ? "border-primary-500 bg-primary-50" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Icon size={14} className={meta.color} />
                        <span className="font-medium text-brand-text text-xs">
                          {account.username ? `@${account.username}` : meta.label}
                        </span>
                        {isSelected && <CheckCircle size={12} className="text-primary-500" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tab */}
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

            {/* YouTube fields */}
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
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
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
                    <option value="private">Private</option>
                  </select>
                </div>
              </div>
            )}

            {/* Caption for non-YouTube */}
            {accounts.some((a) => selectedIds.includes(a.id) && a.platform.toLowerCase() !== "youtube") && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">Caption / Post Text</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  maxLength={2200}
                  rows={3}
                  placeholder="Write your caption here — used for Instagram, TikTok, LinkedIn, etc."
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
                    min={minDate}
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

            {/* Action */}
            <Button
              onClick={handleSubmit}
              loading={loading}
              disabled={!selectedIds.length || accounts.length === 0}
              size="lg"
              className="w-full gap-2"
            >
              {tab === "now"
                ? <><Send size={16} /> Publish to {selectedIds.length} Platform{selectedIds.length !== 1 ? "s" : ""}</>
                : <><Clock size={16} /> Schedule Post</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
