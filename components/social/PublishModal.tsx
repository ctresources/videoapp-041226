"use client";

import { Button } from "@/components/ui/button";
import { downloadAsset } from "@/lib/utils/video-url";
import {
  X, Send, Calendar, CheckCircle, AlertTriangle, Clock,
  PlayCircle, Camera, Music2, Share2, Globe, AtSign, Download, Image, Sparkles, User
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  // Declared here rather than beside the render: the thumbnail effect below
  // lists it as a dependency, and a const read before its own declaration is
  // a crash, not a warning.
  const hasYoutube = accounts.some((a) => selectedIds.includes(a.id) && a.platform.toLowerCase() === "youtube");
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
   * The photo-backed thumbnail, built here rather than in AI Tools.
   *
   * The plain card — hook text on a dark ground — is what a project without
   * photos gets, and it was what every project got, because the good one lived
   * behind a separate tool that had to be visited by hand. A listing video
   * already has the pictures; a thumbnail that uses one of them is a promise
   * the video keeps.
   */
  const [projectId, setProjectId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [hasStoredThumb, setHasStoredThumb] = useState<boolean | null>(null);
  const [photoThumb, setPhotoThumb] = useState<string | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  // The market printed on the badge. Editable here because here is where it is
  // read — sending someone to another screen to fix a word they are looking at
  // is how it went unfixed.
  const [badgeCity, setBadgeCity] = useState("");
  const [badgeState, setBadgeState] = useState("");
  /**
   * Who appears on the thumbnail.
   *
   * "" means "whoever this project already used, else the profile headshot" —
   * the render resolves that itself, so the empty value is not a null choice
   * but the deliberate one, and picking a backdrop no longer has to say
   * anything about the person.
   */
  const [looks, setLooks] = useState<{ id: string; name: string; preview_image_url: string }[]>([]);
  const [headshotUrl, setHeadshotUrl] = useState<string | null>(null);
  const [cutout, setCutout] = useState("");
  /** Stops the auto-build from running twice, and from re-running on a swap. */
  const autoBuilt = useRef(false);

  /**
   * Fill anything the caller did not hand us.
   *
   * The camera recorder mounts this window with an id and a title only, so
   * the Description box opened empty — and because the server substitutes its
   * own default for an empty field, YouTube then received an AI description
   * the user had never seen. Fetching the same defaults My Content passes
   * means both routes publish the same thing, and the box shows it first.
   */
  useEffect(() => {
    // Always fetched, never skipped.
    //
    // This used to return early whenever the caller passed any copy, which My
    // Content always does — so the request never went out on the ordinary
    // route, only for dubs and the camera recorder. That was harmless while
    // the response held nothing but fallbacks for text already on screen. It
    // stopped being harmless the moment the response also carried the
    // project's photos and market, which have no caller-supplied equivalent:
    // they simply never arrived, and a picker with nothing to show renders as
    // no picker at all.
    //
    // The caller's copy still wins — that guard moved down to the three fields
    // it was actually protecting.
    const callerSuppliedCopy = !!(defaultDescription || defaultCaption || defaultTags.length);
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
        if (!callerSuppliedCopy) {
          if (d.description) setDescription(withFetchedTags(d.description));
          if (d.caption) setCaption(withFetchedTags(d.caption));
          if (d.title) setTitle((cur) => cur && cur !== "Untitled Video" ? cur : d.title);
        }
        // videoTitle="" is how a caller says "you resolve it" — see the dub
        // branch in My Content.
        // A caller-passed thumbnail already wins over this one downstream, so
        // this is a fallback either way and is safe to always accept.
        if (d.thumbnailUrl) setFetchedThumbnail(d.thumbnailUrl);
        setProjectId(d.projectId ?? null);
        setPhotos(Array.isArray(d.photos) ? d.photos : []);
        setHasStoredThumb(!!d.hasStoredThumbnail);
        setBadgeCity(d.city || "");
        setBadgeState(d.state || "");
        setHeadshotUrl(d.headshotUrl || null);
        // Mark the tile this thumbnail was actually built with, so the picker
        // opens showing the truth rather than defaulting to the first tile.
        setCutout(d.thumbnailPhotoUrl || "");
      })
      .catch(() => { /* the boxes stay as they are; publishing still works */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  /**
   * Render the photo thumbnail on a chosen backdrop.
   *
   * Passing backgroundUrl skips the AI scene entirely, so this is a crop and a
   * text pass rather than an image generation — seconds, not a minute.
   */
  /**
   * @param nextCutout the person to use, when it is being changed in the same
   *   click. setCutout does not apply until the next render, so reading the
   *   state here would send the previous pick — the tile would highlight and
   *   the image would not change.
   */
  async function buildPhotoThumb(photo: string, quiet = false, nextCutout?: string) {
    if (!projectId || thumbBusy) return;
    setThumbBusy(true);
    setActivePhoto(photo || null);
    try {
      const res = await fetch("/api/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No headline on purpose. The generator writes a 3-4 word curiosity
        // hook when none is given ("INSIDE TRANSFORMATION!"); handing it the
        // YouTube title instead gets clamped to that title's first four words
        // ("A FULLY REMODELED ONE-LEVEL"), which is a caption, not a hook.
        body: JSON.stringify({
          projectId,
          // Empty means "paint a scene" — the generator's own default.
          ...(photo ? { backgroundUrl: photo } : {}),
          // Sent on every build, so a corrected market survives a photo swap
          // instead of reverting to what the project used to say.
          ...(badgeCity.trim() ? { city: badgeCity.trim() } : {}),
          ...(badgeState.trim() ? { state: badgeState.trim() } : {}),
          // Omitted when empty on purpose: the render then keeps whoever this
          // project last used rather than resetting to the headshot.
          ...((nextCutout ?? cutout) ? { photoUrl: nextCutout ?? cutout } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't build the thumbnail");
      setPhotoThumb(data.url);
      if (!quiet) toast.success("Thumbnail updated");
    } catch (err) {
      // On the automatic pass this is silent by design: the plain card is
      // already on screen and still publishes. Only a deliberate swap earns
      // an error message.
      if (!quiet) toast.error(err instanceof Error ? err.message : "Couldn't build the thumbnail");
      setActivePhoto(null);
    } finally {
      setThumbBusy(false);
    }
  }

  /**
   * Build one automatically, once, when the project has photos and nothing has
   * been rendered before. A stored thumbnail is someone's earlier choice and
   * is never overwritten.
   */
  useEffect(() => {
    if (autoBuilt.current) return;
    if (hasStoredThumb !== false) return;
    if (!projectId || photos.length === 0) return;
    autoBuilt.current = true;
    buildPhotoThumb(photos[0], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStoredThumb, projectId, photos]);

  useEffect(() => {
    fetch("/api/avatar/looks")
      .then((r) => (r.ok ? r.json() : { looks: [] }))
      .then((d) => setLooks(
        ((d.looks || []) as { id: string; name: string; preview_image_url: string | null }[])
          .filter((l): l is { id: string; name: string; preview_image_url: string } => !!l.preview_image_url),
      ))
      .catch(() => { /* the picker just shows the default tile */ });
  }, []);

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
                ? `Your video will go public on ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString()}`
                : "Your video is live on YouTube."}
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

            {/* Thumbnail — shown whatever is selected. It was inside the
                YouTube-only block, which made a good thumbnail invisible to
                anyone posting to Instagram, and hid the photo picker with
                it. YouTube is the only platform we can APPLY it to; every
                other one still wants the image, downloaded. */}
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
                          await downloadAsset(photoThumb || thumbnailUrl, "youtube-thumbnail", "png");
                        } catch {
                          window.open(photoThumb || thumbnailUrl, "_blank");
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
                      src={photoThumb || thumbnailUrl}
                      alt="YouTube thumbnail preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* The market printed on the badge, fixed where it is read.
                      Saving rebuilds the thumbnail AND corrects the project, so
                      titles and descriptions stop disagreeing with it. */}
                  {projectId && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        value={badgeCity}
                        onChange={(e) => setBadgeCity(e.target.value)}
                        placeholder="City or area on the badge"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      <input
                        value={badgeState}
                        onChange={(e) => setBadgeState(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="ST"
                        className="w-12 rounded-lg border border-slate-200 px-2 py-1.5 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      <button
                        type="button"
                        onClick={() => buildPhotoThumb(activePhoto || photos[0] || "")}
                        disabled={thumbBusy || !badgeCity.trim()}
                        className="flex-none rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {thumbBusy ? "…" : "Update"}
                      </button>
                    </div>
                  )}

                  {/* Who is on it. Separate from the backdrop strip below,
                      because they are two different questions and answering
                      one used to silently answer the other. */}
                  {projectId && (looks.length > 0 || headshotUrl) && (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-400 mb-1.5">Who appears on it</p>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {/* The profile headshot, shown as itself. It was a
                            generic tile meaning "the default", which after the
                            project started remembering its cutout no longer
                            led anywhere — there was no way back to the plain
                            headshot once a look had been picked. Sending the
                            URL outright is that way back. */}
                        <button
                          type="button"
                          onClick={() => {
                            const next = headshotUrl || "";
                            setCutout(next);
                            buildPhotoThumb(activePhoto || photos[0] || "", false, next);
                          }}
                          disabled={thumbBusy || !headshotUrl}
                          title={headshotUrl ? "Use your profile headshot" : "Add a headshot in Settings to use it here"}
                          className={`h-12 w-12 flex-none overflow-hidden rounded-full border-2 flex items-center justify-center bg-slate-50 transition-colors disabled:opacity-40 ${
                            headshotUrl && cutout === headshotUrl ? "border-primary-500" : "border-transparent hover:border-slate-300"
                          }`}
                        >
                          {headshotUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={headshotUrl} alt="Your headshot" className="h-full w-full object-cover" />
                          ) : (
                            <User size={16} className="text-slate-400" />
                          )}
                        </button>
                        {looks.map((l) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => { setCutout(l.preview_image_url); buildPhotoThumb(activePhoto || photos[0] || "", false, l.preview_image_url); }}
                            disabled={thumbBusy}
                            title={l.name}
                            className={`h-12 w-12 flex-none overflow-hidden rounded-full border-2 transition-colors disabled:opacity-50 ${
                              cutout === l.preview_image_url ? "border-primary-500" : "border-transparent hover:border-slate-300"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={l.preview_image_url} alt={l.name} className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Swap the backdrop. Built from the first photo already —
                      this is for disagreeing with that pick. */}
                  {photos.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-400 mb-1.5">
                        {thumbBusy ? "Building…" : "Tap a photo to use it as the backdrop"}
                      </p>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {photos.map((src) => (
                          <button
                            key={src}
                            type="button"
                            onClick={() => buildPhotoThumb(src)}
                            disabled={thumbBusy}
                            className={`h-12 w-20 flex-none overflow-hidden rounded-lg border-2 transition-colors disabled:opacity-50 ${
                              activePhoto === src ? "border-primary-500" : "border-transparent hover:border-slate-300"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No photos means an AI b-roll video, which has no picture
                      of its own to borrow. The generator can still paint a
                      scene, but that is an image generation with a real cost,
                      so it is a button rather than something that happens on
                      every open. One click, and no trip to AI Tools. */}
                  {photos.length === 0 && projectId && !photoThumb && (
                    <button
                      type="button"
                      onClick={() => buildPhotoThumb("")}
                      disabled={thumbBusy}
                      className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:opacity-50"
                    >
                      <Sparkles size={11} />
                      {thumbBusy ? "Designing…" : "Design a bolder thumbnail"}
                    </button>
                  )}

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

            {/* YouTube-specific fields */}
            {hasYoutube && (
              <div className="flex flex-col gap-3">
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
                  {/* Scheduling and privacy cannot both be honoured. YouTube
                      holds a scheduled upload as private and then makes it
                      PUBLIC at the appointed time — there is no "publish this
                      privately later". Offering the choice anyway meant
                      picking Private and scheduling produced a public video,
                      silently. So the control says what will happen instead of
                      taking an answer it cannot keep. */}
                  {tab === "schedule" ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
                      Public at the scheduled time
                      <span className="mt-0.5 block text-[11px] leading-[1.4] text-slate-400">
                        YouTube holds it privately until then. Post now instead if you need it unlisted or private.
                      </span>
                    </div>
                  ) : (
                    <select
                      value={privacy}
                      onChange={(e) => setPrivacy(e.target.value as "public" | "unlisted" | "private")}
                      className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="public">Public</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  )}
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
                ? <><Send size={16} /> {selectedIds.length > 0 ? "Publish to YouTube" : "Select a Platform"}</>
                : <><Clock size={16} /> Schedule Post</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
