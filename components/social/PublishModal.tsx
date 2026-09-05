"use client";

import { Button } from "@/components/ui/button";
import { downloadAsset } from "@/lib/utils/video-url";
import {
  X, Send, Calendar, CheckCircle, AlertTriangle, Clock,
  PlayCircle, Camera, Music2, Share2, Globe, AtSign, Download, Image
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface SocialAccount {
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
  thumbnailUrl?: string;
  onClose: () => void;
  onPublished?: () => void;
}

const PLATFORM_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  youtube:   { label: "YouTube",   icon: PlayCircle, color: "text-red-500" },
  instagram: { label: "Instagram", icon: Camera,     color: "text-pink-500" },
  tiktok:    { label: "TikTok",    icon: Music2,     color: "text-slate-700" },
  linkedin:  { label: "LinkedIn",  icon: AtSign,     color: "text-spark-blue" },
  twitter:   { label: "Twitter/X", icon: AtSign,     color: "text-spark-blue" },
  facebook:  { label: "Facebook",  icon: Share2,     color: "text-spark-blue" },
  threads:   { label: "Threads",   icon: Share2,     color: "text-slate-700" },
  bluesky:   { label: "Bluesky",   icon: Globe,      color: "text-spark-blue" },
  pinterest: { label: "Pinterest", icon: Globe,      color: "text-red-600" },
};

type Tab = "now" | "schedule";

export function PublishModal({
  videoId, videoTitle, defaultCaption = "", defaultDescription = "",
  defaultTags = [], thumbnailUrl: thumbnailUrlProp, onClose, onPublished
}: PublishModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /**
   * The hashtags, appended once to whatever text they belong under.
   *
   * `defaultTags` has been on this component's props all along and was never
   * read, so the tags generated with the script — shown as chips on the share
   * kit, stored on the project — stopped at the one screen that posts. They go
   * on their own line at the end, which is where every platform expects them,
   * and are skipped entirely if the text already carries them (a caption the
   * user pasted in, or a re-open of this modal).
   */
  const withTags = (text: string) => {
    const tags = defaultTags
      .map((t) => t.trim().replace(/^#+/, ""))
      .filter(Boolean)
      .map((t) => `#${t}`);
    if (!tags.length) return text;
    const body = text.trim();
    if (tags.every((t) => body.includes(t))) return body;
    return body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ");
  };

  const [caption, setCaption] = useState(() => withTags(defaultCaption));
  const [title, setTitle] = useState(videoTitle);
  const [description, setDescription] = useState(() => withTags(defaultDescription));
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [tab, setTab] = useState<Tab>("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [posted, setPosted] = useState(false);
  /** null = not attempted (no YouTube target), true/false = the real outcome. */
  const [thumbnailSet, setThumbnailSet] = useState<boolean | null>(null);
  /** Resolved for callers that pass no thumbnail — see the defaults fetch. */
  const [fetchedThumbnail, setFetchedThumbnail] = useState<string | null>(null);
  const thumbnailUrl = thumbnailUrlProp || fetchedThumbnail || undefined;

  /**
   * Fill anything the caller did not hand us.
   *
   * The camera recorder mounts this window with an id and a title only, so
   * the Description box opened empty — and because the server substitutes its
   * own default for an empty field, YouTube then received an AI description
   * the user had never seen. Fetching the same defaults My Videos passes
   * means both routes publish the same thing, and the box shows it first.
   */
  useEffect(() => {
    if (defaultDescription || defaultCaption || defaultTags.length) return;
    let cancelled = false;
    fetch(`/api/social/publish-defaults?videoId=${encodeURIComponent(videoId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
        const withFetchedTags = (text: string) => {
          const hashes = tags.map((t) => `#${String(t).trim().replace(/^#+/, "")}`).filter((t) => t.length > 1);
          if (!hashes.length) return text;
          const body = text.trim();
          if (hashes.every((t) => body.includes(t))) return body;
          return body ? `${body}

${hashes.join(" ")}` : hashes.join(" ");
        };
        if (d.description) setDescription(withFetchedTags(d.description));
        if (d.caption) setCaption(withFetchedTags(d.caption));
        if (d.title) setTitle((cur) => cur && cur !== "Untitled Video" ? cur : d.title);
        // videoTitle="" is how a caller says "you resolve it" — see the dub
        // branch in My Videos.
        if (d.thumbnailUrl) setFetchedThumbnail(d.thumbnailUrl);
      })
      .catch(() => { /* the boxes stay as they are; publishing still works */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  useEffect(() => {
    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then(({ accounts: data }) => {
        const accs = data || [];
        setAccounts(accs);
        setSelectedIds(accs.map((a: SocialAccount) => a.id));
        setLoadingAccounts(false);
      })
      .catch(() => setLoadingAccounts(false));
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

      // A 200 does not mean every target succeeded — one platform can fail
      // while another goes out. Surface the ones that didn't rather than
      // letting the success toast speak for all of them.
      const failed: Array<{ platform: string; error?: string }> = (data.results || [])
        .filter((r: { status: string }) => r.status === "failed");
      for (const f of failed) {
        toast.error(`${f.platform}: ${f.error || "failed to post"}`, { duration: 8000 });
      }

      setPosted(true);
      // null = YouTube wasn't part of this publish, so there is nothing to say
      // about a thumbnail. false = it was, and the thumbnail didn't take.
      setThumbnailSet(data.thumbnailSet ?? null);
      if (scheduledAt) {
        toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()} 📅`);
      } else {
        // Count what actually went out, not what was selected — claiming
        // "2 platforms" when one failed is how the original bug read.
        const okCount = selectedIds.length - failed.length;
        toast.success(`Published to ${okCount} platform${okCount === 1 ? "" : "s"}! 🚀`);
        // Surfaced as its own message: the upload succeeded, so a failed
        // thumbnail is a follow-up task, not an error.
        if (data.thumbnailSet === false) {
          toast("Thumbnail wasn't applied — YouTube needs a phone-verified channel. Download it here and set it in YouTube Studio.", {
            icon: "🖼️",
            duration: 8000,
          });
        }
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
            {/* Title — always visible */}
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

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
                    <Link href="/social" className="underline font-medium" onClick={onClose}>
                      Connect YouTube →
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
                          {account.name || meta.label}
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

            {/* YouTube-specific fields */}
            {hasYoutube && (
              <div className="flex flex-col gap-3">
                {/* Thumbnail */}
                {thumbnailUrl && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Image size={12} /> YouTube Thumbnail
                      </label>
                      {/* Fetched and saved, not linked: this is on Supabase
                          Storage, so the download attribute did nothing and the
                          PNG opened in a tab — at the exact moment the user was
                          told to save it and upload it by hand. */}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await downloadAsset(thumbnailUrl, "youtube-thumbnail", "png");
                          } catch {
                            window.open(thumbnailUrl, "_blank");
                          }
                        }}
                        className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Download size={11} /> Download PNG
                      </button>
                    </div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 aspect-video w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnailUrl}
                        alt="YouTube thumbnail preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {thumbnailSet === false ? (
                      <p className="text-xs text-amber-700 mt-1">
                        1280×720 · YouTube wouldn&apos;t take it — custom thumbnails need a phone-verified
                        channel. Download it above and set it in YouTube Studio.
                      </p>
                    ) : thumbnailSet ? (
                      <p className="text-xs text-emerald-700 mt-1">1280×720 · Applied to your YouTube video.</p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">
                        1280×720 · Applied to YouTube when you publish. Needs a phone-verified channel —
                        we&apos;ll tell you here if it doesn&apos;t take.
                      </p>
                    )}
                  </div>
                )}
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
              disabled={accounts.length === 0}
              size="lg"
              className="w-full gap-2"
            >
              {tab === "now"
                ? <><Send size={16} /> {selectedIds.length > 0 ? `Publish to ${selectedIds.length} Platform${selectedIds.length !== 1 ? "s" : ""}` : "Select a Platform"}</>
                : <><Clock size={16} /> Schedule Post</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
