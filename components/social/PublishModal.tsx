"use client";

import { Button } from "@/components/ui/button";
import { downloadAsset } from "@/lib/utils/video-url";
import {
  X, Send, Calendar, CheckCircle, AlertTriangle, Clock,
  PlayCircle, Camera, Music2, Share2, Globe, AtSign, Download, Image, Upload, User, MapPin, Plus
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FIRST_COMMENT_PLATFORMS } from "@/lib/utils/social-platforms";
import { uploadImage } from "@/lib/utils/upload-image";
import { DEFAULT_THUMB_STYLE, type ThumbStyle } from "@/lib/utils/thumbnail-style";
import { ThumbnailEditor } from "@/components/social/thumbnail-editor";

interface SocialAccount {
  id: string;
  platform: string;
  name: string;
  username?: string;
  /** "native" is our own YouTube connection; "partner" is every other platform. */
  source?: "native" | "partner";
  /** Its sign-in expired; it cannot be posted to until it is connected again. */
  needsReconnect?: boolean;
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
  x:         { label: "X",         icon: AtSign,     color: "text-slate-700" },
  google_business: { label: "Google Business", icon: MapPin, color: "text-spark-blue" },
};

type Tab = "now" | "schedule";

/** One platform's latest post of this video, for "Where it's posted". */
interface PostedRow {
  id: string;
  platform: string;
  status: string;
  at: string | null;
  url: string | null;
  error: string | null;
  caption: string | null;
  canEdit: boolean;
}

/** "Facebook", "YouTube and Facebook", "3 platforms": short enough for a button. */
function namePlatforms(platforms: string[]): string {
  const names = Array.from(new Set(platforms.map((p) => PLATFORM_META[p.toLowerCase()]?.label || p)));
  if (names.length <= 2) return names.join(" and ");
  return `${names.length} platforms`;
}

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
  /** Posted under the video once it is up. Starts as the blog post's address
   *  when the agent has saved one, because a link in a caption is not
   *  clickable on Instagram and a link in a comment is. */
  const [firstComment, setFirstComment] = useState("");
  /** Where this video has already gone, and what happened there. */
  const [history, setHistory] = useState<PostedRow[]>([]);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function loadHistory() {
    fetch(`/api/social/posts?videoId=${encodeURIComponent(videoId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.posts) setHistory(d.posts); })
      .catch(() => { /* the list simply does not appear */ });
  }
  useEffect(() => { loadHistory(); }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", postId: editing.id, caption: editing.text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The caption couldn't be changed.");
      setHistory((prev) => prev.map((h) => (h.id === editing.id ? { ...h, caption: data.caption ?? editing.text } : h)));
      setEditing(null);
      toast.success("Caption updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The caption couldn't be changed.");
    } finally {
      setSavingEdit(false);
    }
  }

  /** Google Business only: post as an event with a date, such as an open house. */
  const [asEvent, setAsEvent] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [title, setTitle] = useState(videoTitle);
  const [description, setDescription] = useState(() => withTags(defaultDescription));
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [tab, setTab] = useState<Tab>("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [posted, setPosted] = useState(false);
  /** How many platforms besides YouTube this plan posts one video to; null is all of them. */
  const [otherLimit, setOtherLimit] = useState<number | null>(null);
  // The check on posts handed to other platforms, which land minutes later.
  // Cleared when the window closes; the webhook settles them either way.
  const statusTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (statusTimer.current) clearInterval(statusTimer.current); }, []);
  /** null = not attempted (no YouTube target), true/false = the real outcome. */
  const [thumbnailSet, setThumbnailSet] = useState<boolean | null>(null);
  /** Where the last publish went: already live, and still being sent. The
   *  finished screen said "live on YouTube" whatever had been chosen. */
  const [outcome, setOutcome] = useState<{ live: string[]; sending: string[] }>({ live: [], sending: [] });
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
  /** The thumbnail editor (2026-10-25): its words, font, size, colour and style. */
  const [editorOpen, setEditorOpen] = useState(false);
  const [thumbStyle, setThumbStyle] = useState<ThumbStyle>(DEFAULT_THUMB_STYLE);
  // The market printed on the badge. Editable here because here is where it is
  // read — sending someone to another screen to fix a word they are looking at
  // is how it went unfixed.
  const [badgeCity, setBadgeCity] = useState("");
  const [badgeState, setBadgeState] = useState("");
  /** Changed since the last build. An emptied pair of boxes then means "no badge". */
  const [badgeDirty, setBadgeDirty] = useState(false);
  /**
   * The words printed across the image — the biggest thing on it, and the last
   * thing here that could not be changed.
   *
   * Empty means "let the AI write one", which is what every thumbnail built
   * from this window used to get. It is seeded with whatever the current image
   * actually says, so editing starts from the truth rather than a blank box
   * beside a picture with words on it.
   */
  const [headline, setHeadline] = useState("");
  const headlineWords = headline.trim() ? headline.trim().split(/\s+/).length : 0;
  /**
   * What the generated picture shows.
   *
   * The words were editable here and the picture was not: it came from a
   * sentence written off the script, which nobody could see and nobody could
   * correct. Only consulted when a background is being generated — with a
   * photo chosen, the photo is the answer.
   */
  const [scene, setScene] = useState("");
  /** Set once the video is on YouTube, so its thumbnail can be replaced there. */
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const [reapplying, setReapplying] = useState(false);
  /**
   * A photograph of the agent's own, as the thumbnail's backdrop.
   *
   * The panel could already use a listing photo or paint an AI scene, and the
   * one thing it could not take was a picture the agent has — the shot from
   * the open house, the sign in front of the house, a photo somebody sent
   * them. Nothing downstream needed to change for it: the renderer has always
   * accepted any image URL as the backdrop.
   */
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [uploadingBg, setUploadingBg] = useState(false);

  async function handleBgFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !projectId) return;
    setUploadingBg(true);
    try {
      const url = await uploadImage(file, "thumbBg");
      // Straight into a rebuild: an uploaded photo that sat there waiting for
      // another press would look like the upload had failed.
      await buildPhotoThumb(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That photo could not be uploaded");
    } finally {
      setUploadingBg(false);
    }
  }
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
  /**
   * The extras are still being composited onto this video.
   *
   * The row is marked completed before b-roll, music and captions are added —
   * work measured at nearly four minutes — so publishing inside that window
   * sends the bare presenter to YouTube and the finished version never gets
   * there. Said beside the button, because that is where the cost is paid.
   */
  const [stillFinishing, setStillFinishing] = useState(false);
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
        /**
         * Each field on its own.
         *
         * One guard covered all three: if the caller passed a description or
         * hashtags, nothing was taken from here, the caption included. My
         * Sparks passes both for every video, and passes an empty caption for
         * any video with no short blurb of its own (a photo reel), so the
         * caption written for that video was never loaded and the post went
         * out as hashtags and nothing else.
         *
         * With no caption anywhere, the title is at least what the post is
         * about. Not over anything typed while this was loading.
         */
        if (!defaultDescription && d.description) setDescription(withFetchedTags(d.description));
        if (!defaultCaption) {
          const words = d.caption || d.title || videoTitle || "";
          if (words) {
            const untouched = withTags("").trim();
            setCaption((cur) => (cur.trim() === untouched ? withFetchedTags(words) : cur));
          }
        }
        if (!callerSuppliedCopy && d.title) setTitle((cur) => cur && cur !== "Untitled Video" ? cur : d.title);
        // videoTitle="" is how a caller says "you resolve it" — see the dub
        // branch in My Content.
        // A caller-passed thumbnail already wins over this one downstream, so
        // this is a fallback either way and is safe to always accept.
        if (d.thumbnailUrl) setFetchedThumbnail(d.thumbnailUrl);
        setProjectId(d.projectId ?? null);
        setPhotos(Array.isArray(d.photos) ? d.photos : []);
        setHasStoredThumb(!!d.hasStoredThumbnail);
        if (typeof d.blogUrl === "string" && d.blogUrl) {
          // Not over anything typed while this was loading.
          setFirstComment((cur) => cur || `Read the full article: ${d.blogUrl}`);
        }
        setBadgeCity(d.city || "");
        setBadgeState(d.state || "");
        setHeadshotUrl(d.headshotUrl || null);
        // Mark the tile this thumbnail was actually built with, so the picker
        // opens showing the truth rather than defaulting to the first tile.
        setCutout(d.thumbnailPhotoUrl || "");
        setHeadline(d.thumbnailHeadline || "");
        setScene(d.thumbnailScene || "");
        setYoutubeVideoId(d.youtubeVideoId || null);
        setStillFinishing(!!d.stillFinishing);
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
  async function buildPhotoThumb(
    photo: string,
    quiet = false,
    nextCutout?: string,
    nextHeadline?: string,
    nextStyle?: ThumbStyle,
  ) {
    if (!projectId || thumbBusy) return;
    setThumbBusy(true);
    setActivePhoto(photo || null);
    try {
      const res = await fetch("/api/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The headline is sent only when it was typed. What must never be sent
        // is the YouTube TITLE: the generator clamps to four words, so a title
        // arrives as its own first four ("A FULLY REMODELED ONE-LEVEL") — a
        // caption, not a hook. Left empty, the generator writes the 3-4 word
        // curiosity line it always did ("INSIDE TRANSFORMATION!").
        body: JSON.stringify({
          projectId,
          // Empty means "paint a scene" — the generator's own default.
          ...(photo ? { backgroundUrl: photo } : {}),
          // Sent on every build, so a corrected market survives a photo swap
          // instead of reverting to what the project used to say.
          ...(badgeCity.trim() ? { city: badgeCity.trim() } : {}),
          ...(badgeState.trim() ? { state: badgeState.trim() } : {}),
          // Emptied on purpose: no badge. The project remembers, so the next
          // build, which sends nothing here, does not bring it back.
          ...(badgeDirty && !badgeCity.trim() && !badgeState.trim() ? { noMarket: true } : {}),
          // Sent on every build for the same reason the market is: a backdrop
          // swap should change the backdrop, not quietly rewrite the words
          // someone chose.
          ...((nextHeadline ?? headline).trim() ? { headline: (nextHeadline ?? headline).trim() } : {}),
          // Ignored by the server when a backdrop photo is sent, which is why
          // this can be passed on every build without a second thought.
          ...(scene.trim() ? { scene: scene.trim() } : {}),
          // Omitted when empty on purpose: the render then keeps whoever this
          // project last used rather than resetting to the headshot.
          ...((nextCutout ?? cutout) ? { photoUrl: nextCutout ?? cutout } : {}),
          // The words' font, size, colour and style, on every build, so a new
          // backdrop keeps the look the editor chose (2026-10-25).
          style: nextStyle ?? thumbStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't build the thumbnail");
      if (nextStyle) setThumbStyle(nextStyle);
      setPhotoThumb(data.url);
      // What the badge says now, which is blank when it was left off.
      if (typeof data.city === "string") setBadgeCity(data.city);
      if (typeof data.state === "string") setBadgeState(data.state);
      setBadgeDirty(false);
      // What the image says, including when the generator wrote it — so the
      // box stops saying "AI writes it" about words that now exist.
      if (data.headline) setHeadline(data.headline);
      // What it was asked to show, including the sentence written from the
      // script — so the next New background builds on words on screen.
      if (data.scene) setScene(data.scene);
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
   * Put the current thumbnail on the video that is already live.
   *
   * Everything above changes the image in the app. For a video that has been
   * published, that is the half nobody sees — YouTube keeps whatever was sent
   * at upload time, and the only way to correct it was to publish the whole
   * video again. The server sends the project's own saved thumbnail; nothing
   * here chooses the image, only when to push it.
   */
  async function reapplyThumbnail() {
    if (reapplying) return;
    setReapplying(true);
    try {
      const res = await fetch("/api/social/youtube/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't update the thumbnail");
      setThumbnailSet(true);
      toast.success("Thumbnail updated on YouTube");
    } catch (err) {
      setThumbnailSet(false);
      toast.error(err instanceof Error ? err.message : "Couldn't update the thumbnail");
    } finally {
      setReapplying(false);
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

  /**
   * The accounts, first on opening and again on coming back from connecting
   * one (2026-10-20, the owner's ask). "Connect an account" opens Social
   * Accounts in a new tab so this window and everything set in it stay; when
   * this tab is looked at again the list reloads. On a reload the choices
   * already made are kept and only a newly connected account is added.
   */
  const knownIds = useRef<Set<string> | null>(null);
  const connectOpened = useRef(false);
  function loadAccounts() {
    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then(({ accounts: data, more }) => {
        const accs: SocialAccount[] = data || [];
        setAccounts(accs);
        const limit: number | null = typeof more?.limit === "number" ? more.limit : null;
        setOtherLimit(limit);
        // Everything ready to post to, up to what the plan allows. An account
        // whose sign-in expired starts unselected: it would only fail.
        let others = 0;
        const ready = accs.filter((a) => {
          if (a.needsReconnect) return false;
          if (a.source !== "partner") return true;
          if (limit !== null && others >= limit) return false;
          others += 1;
          return true;
        }).map((a) => a.id);
        const known = knownIds.current;
        if (!known) setSelectedIds(ready);
        else {
          const added = ready.filter((id) => !known.has(id));
          if (added.length) setSelectedIds((prev) => [...prev.filter((id) => accs.some((a) => a.id === id)), ...added]);
        }
        knownIds.current = new Set(accs.map((a) => a.id));
        setLoadingAccounts(false);
      })
      .catch(() => setLoadingAccounts(false));
  }
  useEffect(() => {
    loadAccounts();
    const back = () => {
      if (document.visibilityState === "visible" && connectOpened.current) {
        connectOpened.current = false;
        loadAccounts();
      }
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Publish pressed with nothing ticked: the window goes up to "Post to" and
   * says what to do there. It was a red toast in the far corner, while the
   * row it meant had been scrolled out of sight (2026-10-20).
   */
  const postToRef = useRef<HTMLDivElement>(null);
  const [postToNudge, setPostToNudge] = useState(false);
  const [postToFlash, setPostToFlash] = useState(false);

  /**
   * YouTube's connection has ended and has to be made again.
   *
   * Known either from the accounts list or from a publish that has just been
   * refused for it. Shown above the button with the way to fix it: the toast
   * that used to be all there was is gone in nine seconds.
   */
  const youtubeNeedsReconnect = accounts.some((a) => a.source === "native" && a.needsReconnect);

  /**
   * Where this video has already gone starts unselected.
   *
   * The window opened with every account highlighted, including the ones the
   * video was already on, so reopening it to retry one platform left the big
   * Publish button a press away from posting to the rest a second time. A
   * platform that is posted, on its way or scheduled is taken out of the
   * starting selection; a failed one stays in. Only until the agent picks for
   * themselves: after that the selection is theirs, and posting somewhere
   * twice on purpose is one tap.
   */
  const pickedByHand = useRef(false);
  useEffect(() => {
    if (pickedByHand.current || history.length === 0 || accounts.length === 0) return;
    const there = new Set(
      history.filter((h) => ["posted", "posting", "scheduled"].includes(h.status)).map((h) => h.platform),
    );
    if (there.size === 0) return;
    setSelectedIds((prev) => prev.filter((id) => {
      const account = accounts.find((a) => a.id === id);
      return !account || !there.has(account.platform.toLowerCase());
    }));
  }, [history, accounts]);

  function toggleAccount(id: string) {
    pickedByHand.current = true;
    const account = accounts.find((a) => a.id === id);
    const adding = !selectedIds.includes(id);
    if (adding && account?.needsReconnect) {
      toast.error(`${account.name} needs to be reconnected first. Open Settings, then Social Accounts.`);
      return;
    }
    if (adding && account?.source === "partner" && otherLimit !== null) {
      const chosen = accounts.filter((a) => a.source === "partner" && selectedIds.includes(a.id)).length;
      if (chosen >= otherLimit) {
        toast.error(`Your plan posts each video to YouTube plus ${otherLimit} more. Unselect one first, or move up a plan to post everywhere.`);
        return;
      }
    }
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }

  /**
   * Follows posts handed to other platforms until each has landed or failed.
   *
   * Those are not finished when the request returns: each platform fetches and
   * processes the video in its own time. Saying "Published" at that point
   * would be a guess, so the first message says they are on their way and
   * this reports each one as its real result comes in. It gives up after a few
   * minutes; the post itself carries on and shows up in My Content.
   */
  function followPosts(refs: string[]) {
    if (!refs.length) return;
    const told = new Set<string>();
    let checks = 0;
    const label = (platform: string) => PLATFORM_META[platform]?.label || platform;
    statusTimer.current = setInterval(async () => {
      checks += 1;
      try {
        const res = await fetch(`/api/social/status?${refs.map((r) => `ref=${encodeURIComponent(r)}`).join("&")}`);
        const data = await res.json();
        for (const post of (data.posts || []) as { platform: string; status: string; error?: string }[]) {
          if (told.has(post.platform)) continue;
          if (post.status === "posted") { told.add(post.platform); toast.success(`${label(post.platform)}: posted`); }
          if (post.status === "failed") { told.add(post.platform); toast.error(`${label(post.platform)}: ${post.error || "couldn't be posted"}`, { duration: 9000 }); }
        }
        if (!data.pending || checks >= 30) {
          if (statusTimer.current) clearInterval(statusTimer.current);
          statusTimer.current = null;
        }
      } catch { /* try again on the next tick */ }
    }, 6000);
  }

  const handleSubmit = () => submit();

  /**
   * Publishes to whatever is ticked. With an account id it is a retry: that
   * one account, now, whatever is ticked or scheduled below. A retry goes out
   * the same way as any other post, so it is recorded and followed the same.
   */
  async function submit(onlyId?: string) {
    const ids = onlyId ? [onlyId] : selectedIds;
    if (!ids.length) {
      postToRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setPostToNudge(true);
      setPostToFlash(true);
      setTimeout(() => setPostToFlash(false), 1600);
      return;
    }

    const scheduledAt = !onlyId && tab === "schedule" && scheduleDate
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : undefined;

    if (!onlyId && tab === "schedule" && !scheduleDate) return toast.error("Pick a date");

    const toGoogle = accounts.some((a) => ids.includes(a.id) && a.platform === "google_business");
    const event = asEvent && toGoogle
      ? { title: eventTitle.trim(), date: eventDate, start: eventStart, end: eventEnd }
      : undefined;
    if (event && (!event.title || !event.date)) return toast.error("Add the event's name and date");
    if (event && event.start && event.end && event.end <= event.start) return toast.error("The event ends before it starts");

    setLoading(true);
    try {
      const targets = accounts
        .filter((a) => ids.includes(a.id))
        .map((a) => ({
          accountId: a.id,
          platform: a.platform.toLowerCase(),
          caption,
          title,
          description,
          privacy,
          firstComment,
          event,
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
      const failed: Array<{ platform: string; error?: string; code?: string }> = (data.results || [])
        .filter((r: { status: string }) => r.status === "failed");
      for (const f of failed) {
        // The reconnect sentence already says which platform; the others
        // name theirs because their text is the provider's own.
        toast.error(f.code === "youtube_reconnect" ? (f.error || "YouTube needs reconnecting") : `${f.platform}: ${f.error || "failed to post"}`, { duration: 8000 });
      }
      if (failed.some((f) => f.code === "youtube_reconnect")) {
        setAccounts((prev) => prev.map((a) => (a.source === "native" ? { ...a, needsReconnect: true } : a)));
        setSelectedIds((prev) => prev.filter((id) => id !== "native_youtube"));
      }
      // Nothing went anywhere: this is still the form, not the "published"
      // screen, which used to appear whether or not anything had been.
      if (failed.length > 0 && failed.length === (data.results || []).length) return;

      const went = (data.results || []) as { platform: string; status: string }[];
      setOutcome({
        live: went.filter((r) => r.status === "published" || r.status === "posted").map((r) => r.platform),
        sending: went.filter((r) => r.status === "posting").map((r) => r.platform),
      });
      setPosted(true);
      // null = YouTube wasn't part of this publish, so there is nothing to say
      // about a thumbnail. false = it was, and the thumbnail didn't take.
      setThumbnailSet(data.thumbnailSet ?? null);
      if (scheduledAt) {
        toast.success(`Scheduled for ${new Date(scheduledAt).toLocaleString()} 📅`);
      } else {
        // Count what actually went out, not what was selected — claiming
        // "2 platforms" when one failed is how the original bug read. And
        // only what is really live: a post handed to another platform is on
        // its way, not published, and is reported as each one lands.
        const sending = (data.results || []).filter((r: { status: string }) => r.status === "posting").length;
        const okCount = ids.length - failed.length - sending;
        if (okCount > 0) toast.success(`Published to ${okCount} platform${okCount === 1 ? "" : "s"}! 🚀`);
        if (sending > 0) {
          toast(`Sending to ${sending} more platform${sending === 1 ? "" : "s"}. That takes a few minutes; we'll tell you as each one lands.`, { icon: "📤", duration: 7000 });
          followPosts(data.pendingRefs || []);
        }
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
              {/* Another platform takes a few minutes to fetch and process the
                  video, so with nothing live yet this is "on its way", not
                  "published". */}
              {tab === "schedule"
                ? "Post Scheduled!"
                : outcome.live.length > 0 || outcome.sending.length === 0 ? "Published Successfully!" : "On its way!"}
            </p>
            <p className="text-sm text-slate-500">
              {/* Names where it went. It said "live on YouTube" for every
                  publish, including one sent only to Facebook. */}
              {tab === "schedule"
                ? `Your video will go public on ${new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString()}`
                : [
                    outcome.live.length > 0 ? `Your video is live on ${namePlatforms(outcome.live)}.` : "",
                    outcome.sending.length > 0
                      ? `${outcome.live.length > 0 ? "It is" : "Your video is"} on its way to ${namePlatforms(outcome.sending)}. That takes a few minutes, and we'll tell you here when it lands.`
                      : "",
                  ].filter(Boolean).join(" ") || "Your video is published."}
            </p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {/* Where this video has already gone. Shown first because it is
                the answer to "did it post?", which nothing else on any screen
                gives once this window has been closed. */}
            {history.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-xs font-medium text-slate-500 mb-1.5">Where it&apos;s posted</p>
                <ul className="space-y-2">
                  {history.map((h) => {
                    const meta = PLATFORM_META[h.platform] || PLATFORM_META.youtube;
                    const Icon = meta.icon;
                    const day = h.at ? new Date(h.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                    const account = accounts.find((a) => a.platform.toLowerCase() === h.platform && !a.needsReconnect);
                    return (
                      <li key={h.id} className="text-sm">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Icon size={14} className={`shrink-0 ${meta.color}`} />
                          <span className="font-medium text-brand-text">{meta.label}</span>
                          <span className={`text-xs ${
                            h.status === "failed" ? "font-semibold text-red-600"
                              : h.status === "posted" ? "text-green-700" : "text-slate-500"
                          }`}>
                            {h.status === "posted" ? `Posted ${day}`
                              : h.status === "failed" ? "Failed"
                              : h.status === "scheduled" && h.at
                                ? `Scheduled ${new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                                : "On its way"}
                          </span>
                          <span className="ml-auto flex items-center gap-3">
                            {h.url && (
                              <a href={h.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-600 hover:underline">
                                View
                              </a>
                            )}
                            {h.canEdit && editing?.id !== h.id && (
                              <button
                                type="button"
                                onClick={() => setEditing({ id: h.id, text: h.caption ?? "" })}
                                className="text-xs font-semibold text-primary-600 hover:underline"
                              >
                                Edit caption
                              </button>
                            )}
                            {h.status === "failed" && account && (
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => { setTab("now"); submit(account.id); }}
                                className="rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-brand-text hover:border-slate-400 disabled:opacity-50"
                              >
                                Retry
                              </button>
                            )}
                          </span>
                        </div>
                        {h.status === "failed" && h.error && (
                          <p className="mt-0.5 text-xs text-red-600">{h.error}</p>
                        )}
                        {editing?.id === h.id && (
                          <div className="mt-1.5">
                            <textarea
                              value={editing.text}
                              onChange={(e) => setEditing({ id: h.id, text: e.target.value })}
                              rows={3}
                              aria-label={`${meta.label} caption`}
                              className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                            />
                            <div className="mt-1 flex items-center gap-2">
                              <Button size="sm" onClick={saveEdit} loading={savingEdit} disabled={!editing.text.trim()}>Save</Button>
                              <button type="button" onClick={() => setEditing(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

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
            <div
              ref={postToRef}
              className={`rounded-xl transition-shadow duration-300 ${postToFlash ? "ring-2 ring-spark-amber ring-offset-4" : ""}`}
            >
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
                    <a
                      href="/settings/social"
                      target="_blank"
                      rel="noopener"
                      className="underline font-medium"
                      onClick={() => { connectOpened.current = true; }}
                    >
                      Connect an account →
                    </a>
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
                  {/* Always offered (2026-10-20): a new tab, so this window
                      keeps its place; the list reloads on coming back. */}
                  <a
                    href="/settings/social"
                    target="_blank"
                    rel="noopener"
                    onClick={() => { connectOpened.current = true; }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-slate-400"
                  >
                    <Plus size={13} /> Connect an account
                  </a>
                </div>
              )}
              {postToNudge && selectedIds.length === 0 && (
                <p className="mt-2 text-xs font-medium text-spark-amber">Tick where to post, or connect an account.</p>
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

            {/* Directly under the tab that reveals it.
                This sat below the thumbnail panel and the YouTube fields — the
                best part of a screen down — so pressing Schedule looked like a
                button that did nothing, and the date it was waiting for was
                somewhere the eye never went. The choice and what the choice
                asks for are one thing. */}
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
                  {/* The editor for the words, font, size, colour and style, and
                      the backdrop (2026-10-25). Opens as a panel, not inline. */}
                  {projectId && (
                    <button
                      type="button"
                      onClick={() => setEditorOpen(true)}
                      disabled={thumbBusy}
                      className="mt-2 w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                    >
                      Edit thumbnail
                    </button>
                  )}
                  {editorOpen && projectId && (
                    <ThumbnailEditor
                      projectId={projectId}
                      photos={photos}
                      headline={headline}
                      style={thumbStyle}
                      currentBg={activePhoto}
                      busy={thumbBusy}
                      onClose={() => setEditorOpen(false)}
                      onApply={({ backgroundUrl, headline: words, style }) => {
                        setEditorOpen(false);
                        void buildPhotoThumb(backgroundUrl, false, undefined, words, style);
                      }}
                    />
                  )}
                  {/* The words on the image, edited where they are read.
                      This panel could change the market, the backdrop and the
                      person on it, but not the largest thing on the picture —
                      the one control that lived in another tool entirely. */}
                  {projectId && (
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                          placeholder="Words on the image — AI writes them if you leave this empty"
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-primary-300"
                        />
                        <button
                          type="button"
                          onClick={() => buildPhotoThumb(activePhoto || photos[0] || "")}
                          disabled={thumbBusy}
                          className="flex-none rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          {thumbBusy ? "…" : "Update"}
                        </button>
                      </div>
                      {/* Said before the fifth word is lost rather than after:
                          the renderer keeps four and drops the rest, which is
                          silent and looks like a bug. */}
                      <p className="mt-1 text-[11px] text-slate-400">
                        {headlineWords > 4
                          ? `Four words fit — only the first four will print ("${headline.trim().split(/\s+/).slice(0, 4).join(" ").toUpperCase()}").`
                          : headlineWords > 0
                            ? `${headlineWords} of 4 words · printed in capitals`
                            : "Three or four short words read best on a thumbnail."}
                      </p>
                    </div>
                  )}

                  {/* What the picture shows — only where one is being drawn.
                      With listing photos on the project the backdrop strip
                      below already answers this, and a box that changed
                      nothing would be worse than no box. */}
                  {projectId && photos.length === 0 && (
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={scene}
                          onChange={(e) => setScene(e.target.value)}
                          placeholder="What the picture shows — left empty, we read your script"
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-300"
                        />
                        <button
                          type="button"
                          onClick={() => buildPhotoThumb("")}
                          disabled={thumbBusy}
                          className="flex-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-primary-400 hover:text-primary-700 disabled:opacity-50"
                        >
                          {thumbBusy ? "…" : photoThumb ? "New picture" : "Design it"}
                        </button>
                      </div>
                      {/* Why the button is a button. Generating costs real
                          money and one of the monthly images, so it never
                          happens just because this window opened — which is
                          what the standalone "Design a bolder thumbnail" link
                          that used to sit below was saying, less clearly. */}
                      <p className="mt-1 text-[11px] text-slate-400">
                        A scene, not a slogan — &ldquo;a desk of paperwork and house keys in
                        morning light&rdquo;. Never any people or words: your face and your
                        headline go on top.
                      </p>
                    </div>
                  )}

                  {/* Your own photograph, alongside the two backdrops this
                      panel already offered. Always available, unlike the
                      backdrop strip below, which only exists when the project
                      came with listing photos. */}
                  {projectId && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => bgFileRef.current?.click()}
                        disabled={uploadingBg || thumbBusy}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary-400 hover:text-primary-700 disabled:opacity-50"
                      >
                        <Upload size={12} />
                        {uploadingBg ? "Uploading…" : "Upload a photo"}
                      </button>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Your own picture as the backdrop · 1280 × 720 or larger, cropped from the
                        centre · free, and it doesn&apos;t use an AI image.
                      </p>
                      <input
                        ref={bgFileRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleBgFile}
                      />
                    </div>
                  )}

                  {/* The market printed on the badge, fixed where it is read.
                      Saving rebuilds the thumbnail AND corrects the project, so
                      titles and descriptions stop disagreeing with it. */}
                  {projectId && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <input
                        value={badgeCity}
                        onChange={(e) => { setBadgeCity(e.target.value); setBadgeDirty(true); }}
                        placeholder="City or area on the badge"
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      <input
                        value={badgeState}
                        onChange={(e) => { setBadgeState(e.target.value.toUpperCase().slice(0, 2)); setBadgeDirty(true); }}
                        placeholder="ST"
                        className="w-12 rounded-lg border border-slate-200 px-2 py-1.5 text-xs uppercase focus:outline-none focus:ring-2 focus:ring-primary-300"
                      />
                      <button
                        type="button"
                        onClick={() => buildPhotoThumb(activePhoto || photos[0] || "")}
                        // Empty is allowed once the boxes have been changed:
                        // that is how the badge is taken off.
                        disabled={thumbBusy || (!badgeCity.trim() && !badgeDirty)}
                        title={!badgeCity.trim() && !badgeState.trim() && badgeDirty ? "Update with no market badge" : undefined}
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

                  {/* Only once it is live. Before that the thumbnail goes up
                      with the video, so an extra button would be a second way
                      to do what Publish is about to do anyway. */}
                  {youtubeVideoId && (
                    <button
                      type="button"
                      onClick={reapplyThumbnail}
                      disabled={reapplying || thumbBusy}
                      className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-primary-400 hover:text-primary-700 disabled:opacity-50"
                    >
                      <Image size={11} />
                      {reapplying ? "Updating…" : "Update it on YouTube"}
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
                {/* Google Business takes 30 seconds of video at most and no
                    phone numbers, so what goes there is not what goes
                    everywhere else. Said here so the post is not a surprise. */}
                {accounts.some((a) => selectedIds.includes(a.id) && a.platform === "google_business") && (
                  <p className="text-xs text-slate-500 mt-1.5">
                    Google Business gets this caption with any phone number left out, and a Learn more button
                    to your blog post or the video. Videos over 30 seconds go up there as a photo post.
                  </p>
                )}
                {/* An open house, as Google's own Event post: the date and
                    time show on the listing, and it drops off afterwards. */}
                {accounts.some((a) => selectedIds.includes(a.id) && a.platform === "google_business") && (
                  <div className="mt-2">
                    <label className="flex items-center gap-2 text-sm text-brand-text">
                      <input
                        type="checkbox"
                        checked={asEvent}
                        onChange={(e) => {
                          setAsEvent(e.target.checked);
                          // Google allows 58 characters for an event's name.
                          if (e.target.checked && !eventTitle) setEventTitle(title.slice(0, 58));
                        }}
                        className="h-4 w-4 rounded border-slate-300 accent-primary-500"
                      />
                      Post to Google as an event
                    </label>
                    {asEvent && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={eventTitle}
                          onChange={(e) => setEventTitle(e.target.value)}
                          maxLength={58}
                          placeholder="Open house"
                          aria-label="Event name"
                          className="col-span-2 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <input
                          type="date"
                          value={eventDate}
                          min={minDate}
                          onChange={(e) => setEventDate(e.target.value)}
                          aria-label="Event date"
                          className="col-span-2 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                        <label className="text-xs text-slate-500">
                          Starts
                          <input
                            type="time"
                            value={eventStart}
                            onChange={(e) => setEventStart(e.target.value)}
                            className="mt-0.5 block w-full text-sm px-3 py-2 border border-slate-200 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </label>
                        <label className="text-xs text-slate-500">
                          Ends
                          <input
                            type="time"
                            value={eventEnd}
                            onChange={(e) => setEventEnd(e.target.value)}
                            className="mt-0.5 block w-full text-sm px-3 py-2 border border-slate-200 rounded-xl text-brand-text focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Only when it has somewhere to go: X and Google Business take
                no first comment, and YouTube publishes without one. */}
            {accounts.some((a) => selectedIds.includes(a.id) && (FIRST_COMMENT_PLATFORMS as readonly string[]).includes(a.platform.toLowerCase())) && (
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">First comment (optional)</label>
                <input
                  type="text"
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  maxLength={500}
                  placeholder="A link to your blog post"
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}

            {/* Said here rather than on the screen four minutes ago.
                The row is marked completed before the b-roll, music and
                captions are composited, so publishing inside that window sends
                the bare presenter — and the finished version never reaches the
                platform, because the upload already happened. Not a block:
                sometimes the plain read is what you want, and this is the one
                place where knowing costs nothing. */}
            {stillFinishing && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <p className="text-sm leading-[1.45] text-amber-700">
                  Your b-roll, music and captions are still being added — this usually takes
                  three or four minutes. Publishing now sends the plain presenter version.
                  Close this, wait, and refresh to get the finished one.
                </p>
              </div>
            )}

            {youtubeNeedsReconnect && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-[1.45] text-amber-800">
                    Your YouTube connection has expired, so this can&apos;t be published there yet.
                    Reconnect it, then come back and publish. Your video is saved.
                  </p>
                  <a
                    href="/api/auth/youtube"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    Reconnect YouTube
                  </a>
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
                ? <><Send size={16} /> {selectedIds.length > 0
                    ? `Publish to ${namePlatforms(accounts.filter((a) => selectedIds.includes(a.id)).map((a) => a.platform))}`
                    : "Select a Platform"}</>
                : <><Clock size={16} /> Schedule Post</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
