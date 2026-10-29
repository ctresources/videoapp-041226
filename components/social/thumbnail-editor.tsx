"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/utils/upload-image";
import { articleHeadline as articleHeadlineOf } from "@/lib/utils/article-headline";
import {
  THUMB_COLOURS,
  THUMB_FONTS,
  THUMB_TEXT_STYLES,
  type ThumbFont,
  type ThumbStyle,
  type ThumbTextStyle,
} from "@/lib/utils/thumbnail-style";

/**
 * The thumbnail editor, opened from Edit thumbnail in the Publish dialog
 * (2026-10-25). Background, words, font, size, colour and style in one place,
 * so the Publish dialog keeps only the preview and the channels.
 *
 * The preview here is an approximation in the browser's own fonts. Apply
 * draws the exact thumbnail on the server.
 */

type Frame = { url: string; seconds: number };
type BgKind = "still" | "listing" | "mine" | "ai";

/** Everything Apply hands back. backgroundUrl "" means "make an AI picture". */
export interface ThumbApply {
  backgroundUrl: string;
  headline: string;
  style: ThumbStyle;
  /** Set only when the person was changed here. */
  photoUrl?: string;
  photoSide: "left" | "right";
  city: string;
  state: string;
  noMarket: boolean;
  scene?: string;
  /** Set only when the article headline was changed here (2026-10-29). */
  articleHeadline?: string;
}

const PREVIEW_FONT: Record<ThumbFont, string> = {
  anton: "Impact, 'Arial Narrow', sans-serif",
  archivo: "'Arial Black', Impact, sans-serif",
  montserrat: "system-ui, 'Segoe UI', Arial, sans-serif",
};

export function ThumbnailEditor(props: {
  /** With a project, stills from its finished video are offered as backgrounds. */
  projectId?: string;
  /** The caller's own controls (market, person, upload), shown under the style. */
  children?: ReactNode;
  /** Listing photos on the project, offered as backgrounds after the stills. */
  photos: string[];
  headline: string;
  style: ThumbStyle;
  /** The backdrop the thumbnail on screen was built with, if any. */
  currentBg: string | null;
  busy: boolean;
  /** "Photo on it": the headshot, the avatar looks, or an upload. On unless turned off. */
  showPerson?: boolean;
  /** The market badge as it is now, and the side the person stands on. */
  badgeCity?: string;
  badgeState?: string;
  photoSide?: "left" | "right";
  /** What an AI picture was last asked to show. */
  scene?: string;
  /** The project's article headline; with it, a second box to edit it (2026-10-29). */
  articleHeadline?: string | null;
  onApply: (next: ThumbApply) => void;
  onClose: () => void;
}) {
  const showPerson = props.showPerson !== false;
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [framesError, setFramesError] = useState<string | null>(null);
  const [bg, setBg] = useState<string | null>(props.currentBg);
  /** Which kind of background is being picked (2026-10-26, one editor everywhere). */
  const [bgKind, setBgKind] = useState<BgKind>(props.projectId ? "still" : props.photos.length ? "listing" : "ai");
  const [myPhotos, setMyPhotos] = useState<string[]>([]);
  const [uploadingBg, setUploadingBg] = useState(false);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [scene, setScene] = useState(props.scene ?? "");
  const [side, setSide] = useState<"left" | "right">(props.photoSide ?? "right");
  const [city, setCity] = useState(props.badgeCity ?? "");
  const [usState, setUsState] = useState(props.badgeState ?? "");
  const [noBadge, setNoBadge] = useState(false);
  const [words, setWords] = useState(props.headline);
  /**
   * The long headline, the second box (2026-10-29, the owner's ask: both
   * boxes on the thumbnail editor). Read from the project when there is one:
   * the article's headline, else its title. Changing it saves the article
   * headline (/api/projects/headline), which redraws the header image.
   */
  const [articleHeadline, setArticleHeadline] = useState<string | null>(props.articleHeadline ?? null);
  const [headlineAtOpen, setHeadlineAtOpen] = useState<string>(props.articleHeadline ?? "");
  useEffect(() => {
    if (!props.projectId || props.articleHeadline != null) return;
    let live = true;
    void createClient()
      .from("projects")
      .select("title, ai_script, seo_data")
      .eq("id", props.projectId)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const p = data as { title: string | null; ai_script: Record<string, unknown> | null; seo_data: Record<string, unknown> | null } | null;
        const h = articleHeadlineOf(
          (p?.ai_script ?? {}) as { blog_headline?: string; title?: string },
          p?.seo_data as { youtube_title?: string; meta_title?: string } | null,
          p?.title ?? "",
        );
        const v = h === "Untitled post" ? "" : h;
        setArticleHeadline(v);
        setHeadlineAtOpen(v);
      });
    return () => { live = false; };
  }, [props.projectId, props.articleHeadline]);
  const [savingHeadline, setSavingHeadline] = useState(false);
  const [style, setStyle] = useState<ThumbStyle>(props.style);
  /** The agent's brand colours from Settings, offered first. */
  const [brandColors, setBrandColors] = useState<string[]>([]);
  /** The person on it: "" keeps whoever it was built with. */
  const [person, setPerson] = useState("");
  const [people, setPeople] = useState<{ url: string; name: string; shape?: string | null }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Each picked photo's cut-out, for the preview (2026-10-27). */
  const [cutouts, setCutouts] = useState<Record<string, string>>({});
  const [cutting, setCutting] = useState(false);

  useEffect(() => {
    if (!person || person === "none" || cutouts[person]) return;
    let gone = false;
    setCutting(true);
    fetch("/api/tools/thumbnail/cutout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: person }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!gone && d?.url) setCutouts((c) => ({ ...c, [person]: d.url as string })); })
      .catch(() => { /* the preview keeps the photo as it is */ })
      .finally(() => { if (!gone) setCutting(false); });
    return () => { gone = true; };
  }, [person, cutouts]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("brand_colors, avatar_url").eq("id", user.id).maybeSingle();
      const row = data as { brand_colors: string[] | null; avatar_url: string | null } | null;
      setBrandColors((row?.brand_colors ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)));
      if (showPerson && row?.avatar_url) {
        const headshot = row.avatar_url;
        setPeople((p) => (p.some((x) => x.url === headshot) ? p : [{ url: headshot, name: "Your headshot" }, ...p]));
      }
    });
  }, [showPerson]);

  // The avatar looks, as more choices of who is on it.
  useEffect(() => {
    if (!showPerson) return;
    fetch("/api/avatar/looks")
      .then((r) => (r.ok ? r.json() : { looks: [] }))
      .then((d) => {
        const looks = ((d.looks ?? []) as { name: string; preview_image_url: string | null; shape?: string | null }[])
          .filter((l): l is { name: string; preview_image_url: string; shape?: string | null } => !!l.preview_image_url)
          .map((l) => ({ url: l.preview_image_url, name: l.name, shape: l.shape ?? null }));
        setPeople((p) => [...p, ...looks.filter((l) => !p.some((x) => x.url === l.url))]);
      })
      .catch(() => {});
  }, [showPerson]);

  async function uploadPerson(file: File) {
    setUploading(true);
    try {
      const url = await uploadImage(file, "thumb");
      setPeople((p) => [{ url, name: "Your photo" }, ...p]);
      setPerson(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That photo could not be uploaded");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!props.projectId) { setFrames([]); return; }
    let cancelled = false;
    fetch("/api/tools/thumbnail/frames", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: props.projectId }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Couldn't take stills from the video.");
        return d as { frames: Frame[] };
      })
      .then((d) => { if (!cancelled) setFrames(d.frames); })
      .catch((e) => {
        if (!cancelled) setFramesError(e instanceof Error ? e.message : "Couldn't take stills from the video.");
      });
    return () => { cancelled = true; };
  }, [props.projectId]);

  async function uploadBackground(file: File) {
    setUploadingBg(true);
    try {
      const url = await uploadImage(file, "thumbBg");
      setMyPhotos((p) => [url, ...p]);
      setBg(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That photo could not be uploaded");
    } finally {
      setUploadingBg(false);
    }
  }

  const stills = (frames ?? []).map((f) => f.url);
  const options = bgKind === "still" ? stills : bgKind === "listing" ? props.photos : bgKind === "mine" ? myPhotos : [];
  const ai = bgKind === "ai";
  // The picture in the preview: the one picked if it is in this kind, else its first.
  const shown = ai ? null : (bg && options.includes(bg) ? bg : options[0] ?? (bgKind === "still" ? null : bg));
  const colour = style.color ?? "#ffffff";
  const kinds: { id: BgKind; label: string; show: boolean }[] = [
    { id: "still", label: "Still from video", show: !!props.projectId },
    { id: "listing", label: "Listing photo", show: props.photos.length > 0 },
    { id: "mine", label: "My photo", show: true },
    { id: "ai", label: "AI picture", show: true },
  ];

  async function apply() {
    // The long headline first, when it changed: it redraws the header image.
    const changedHeadline = articleHeadline !== null && articleHeadline.trim() && articleHeadline.trim() !== headlineAtOpen.trim()
      ? articleHeadline.trim() : null;
    if (changedHeadline && props.projectId) {
      setSavingHeadline(true);
      try {
        const res = await fetch("/api/projects/headline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: props.projectId, headline: changedHeadline }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(d?.error || "Couldn't save the headline."); return; }
        setHeadlineAtOpen(changedHeadline);
        toast.success(d.headerUrl ? "Headline saved. Header image updated." : "Headline saved.");
      } finally {
        setSavingHeadline(false);
      }
    }
    props.onApply({
      backgroundUrl: ai ? "" : shown ?? "",
      headline: words.trim(),
      style,
      ...(person ? { photoUrl: person } : {}),
      photoSide: side,
      city: noBadge ? "" : city.trim(),
      state: noBadge ? "" : usState.trim().toUpperCase().slice(0, 2),
      noMarket: noBadge,
      ...(ai && scene.trim() ? { scene: scene.trim() } : {}),
      ...(changedHeadline ? { articleHeadline: changedHeadline } : {}),
    });
  }

  function set<K extends keyof ThumbStyle>(key: K, value: ThumbStyle[K]) {
    setStyle((s) => ({ ...s, [key]: value }));
  }

  // Approximate look of the words, in the browser's own fonts.
  const previewWords: CSSProperties = {
    fontFamily: PREVIEW_FONT[style.font],
    fontWeight: 800,
    fontSize: `${Math.round(34 * style.size)}px`,
    textTransform: "uppercase",
    lineHeight: 1.05,
    color: style.textStyle === "box" ? "#10132b" : colour,
    textShadow:
      style.textStyle === "outline"
        ? "-2px 0 #10132b, 2px 0 #10132b, 0 -2px #10132b, 0 2px #10132b"
        : style.textStyle === "plain" ? "0 2px 6px rgba(0,0,0,0.45)" : "none",
    background: style.textStyle === "box" ? (style.color ?? "#ffe600") : "none",
    padding: style.textStyle === "box" ? "0.05em 0.25em" : 0,
    borderRadius: style.textStyle === "box" ? 6 : 0,
    display: "inline",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="flex w-full max-w-xl flex-col overflow-hidden bg-white sm:max-h-[88vh] sm:rounded-2xl sm:shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="font-bold text-brand-text">Edit thumbnail</h3>
          <button type="button" onClick={props.onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* Preview */}
          <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-800">
              {shown && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
              {ai && (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#36506e] to-[#1b2b3f] text-sm font-semibold text-white/80">
                  A new AI picture is made when you press Apply
                </div>
              )}
              {person && person !== "none" && (
                // The cut-out the thumbnail uses (2026-10-27): the person without
                // their photo's background, as the finished thumbnail draws them.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cutouts[person] || person} alt="" className={`absolute bottom-0 ${side === "left" ? "left-[4%]" : "right-[4%]"} h-[88%] w-auto ${cutouts[person] ? "object-contain" : "rounded-t-xl object-cover opacity-60"}`} />
              )}
              {person && person !== "none" && !cutouts[person] && cutting && (
                <span className={`absolute bottom-3 ${side === "left" ? "left-3" : "right-3"} rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white`}>Removing the background…</span>
              )}
              <div className={`absolute bottom-[12%] ${side === "left" ? "left-[38%] right-[6%] text-right" : "left-[6%] right-[38%] text-left"}`}>
                <span style={previewWords}>{words.trim() || "Your words"}</span>
              </div>
              {!noBadge && (city.trim() || usState.trim()) && (
                <span className={`absolute bottom-2 ${side === "left" ? "right-3" : "left-3"} rounded bg-[#ffe600] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#10132b]`}>
                  {[city.trim(), usState.trim()].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">The preview is approximate. Apply draws the exact thumbnail.</p>
          </div>

          {/* Background: every kind in one place (2026-10-26, one editor everywhere). */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Background</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {kinds.filter((k) => k.show).map((k) => (
                <Chip key={k.id} on={bgKind === k.id} onClick={() => setBgKind(k.id)}>{k.label}</Chip>
              ))}
            </div>
            {bgKind === "still" && !frames && !framesError && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin" /> Taking stills from your video…
              </p>
            )}
            {bgKind === "still" && framesError && <p className="text-xs text-amber-700">{framesError}</p>}
            {bgKind === "mine" && (
              <>
                <button
                  type="button"
                  onClick={() => bgFileRef.current?.click()}
                  disabled={uploadingBg}
                  className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
                >
                  <Upload size={14} /> {uploadingBg ? "Uploading…" : "Upload a photo"}
                </button>
                <input
                  ref={bgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadBackground(f); }}
                />
              </>
            )}
            {ai && (
              <>
                <input
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  maxLength={300}
                  placeholder="What the picture shows. Left empty, we read your script."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
                <p className="mt-1.5 text-[11px] text-slate-400">A scene, never people or words. It uses one of your AI images.</p>
              </>
            )}
            {options.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {options.map((url) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setBg(url)}
                    aria-pressed={shown === url}
                    className={`aspect-video overflow-hidden rounded-lg border-2 ${shown === url ? "border-amber-500" : "border-transparent hover:border-slate-300"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {bgKind === "still" && stills.length > 0 && (
              <p className="mt-1.5 text-[11px] text-slate-400">Stills from your video. Pick a moment you like.</p>
            )}
          </div>

          {/* The market badge (2026-10-26, moved here from the Publish window). */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Market badge</p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={city}
                onChange={(e) => { setCity(e.target.value); setNoBadge(false); }}
                placeholder="City or area"
                disabled={noBadge}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
              />
              <input
                value={usState}
                onChange={(e) => { setUsState(e.target.value.toUpperCase().slice(0, 2)); setNoBadge(false); }}
                placeholder="ST"
                disabled={noBadge}
                className="w-14 rounded-lg border border-slate-200 px-2 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-300 disabled:opacity-50"
              />
              <Chip on={noBadge} onClick={() => setNoBadge((n) => !n)}>No badge</Chip>
            </div>
          </div>

          {/* Who is on it (2026-10-26, the owner's ask). */}
          {showPerson && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Photo on it</p>
              <div className="flex flex-wrap items-center gap-2">
                {/* No person at all (2026-10-27, the owner's ask). */}
                <button
                  type="button"
                  onClick={() => setPerson("none")}
                  aria-pressed={person === "none"}
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-2 bg-slate-50 text-[11px] font-semibold text-slate-600 ${person === "none" ? "border-amber-500" : "border-slate-200 hover:border-slate-300"}`}
                >
                  No photo
                </button>
                {people.map((p) => (
                  <div key={p.url} className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setPerson(p.url)}
                      title={p.name}
                      aria-pressed={person === p.url}
                      className={`h-14 w-14 overflow-hidden rounded-full border-2 ${person === p.url ? "border-amber-500" : "border-transparent hover:border-slate-300"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                    </button>
                    {p.shape && (
                      <span className="text-[10px] font-semibold text-slate-500">
                        {p.shape === "landscape" ? "Wide" : p.shape === "portrait" ? "Vertical" : "Square"}
                      </span>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-14 items-center gap-1.5 rounded-full border border-dashed border-slate-300 px-4 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
                >
                  <Upload size={14} /> {uploading ? "Uploading…" : "Upload a photo"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadPerson(f); }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {person === "none" ? "No photo on the thumbnail: just the background and your words." : person ? "This photo goes on the thumbnail when you press Apply." : "Leave it and the thumbnail keeps the photo it has."}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500">Stands on the</span>
                <Chip on={side === "left"} onClick={() => setSide("left")}>Left</Chip>
                <Chip on={side === "right"} onClick={() => setSide("right")}>Right</Chip>
              </div>
            </div>
          )}

          {/* Words: the thumbnail's own (up to 4) and, when there is an
              article, its headline, which is also on the header image
              (2026-10-29, the owner's ask: both boxes). */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Thumbnail words</p>
            <input
              value={words}
              onChange={(e) => setWords(e.target.value)}
              maxLength={60}
              placeholder="Three or four short words"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
            <p className="mt-1 text-[11px] text-slate-400">Up to 4 words fit on a thumbnail.</p>
          </div>
          {articleHeadline !== null && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Headline</p>
              <input
                value={articleHeadline}
                onChange={(e) => setArticleHeadline(e.target.value)}
                maxLength={160}
                placeholder="Your article's headline"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <p className="mt-1 text-[11px] text-slate-400">The full headline: on your article and its header image.</p>
            </div>
          )}

          {/* Font */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Font</p>
            <div className="flex flex-wrap gap-2">
              {THUMB_FONTS.map((f) => (
                <Chip key={f.id} on={style.font === f.id} onClick={() => set("font", f.id)}>{f.label}</Chip>
              ))}
            </div>
          </div>

          {/* Size */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Size <span className="font-normal normal-case text-slate-400">({Math.round(style.size * 100)}%)</span>
            </p>
            <input
              type="range"
              min={70}
              max={130}
              value={Math.round(style.size * 100)}
              onChange={(e) => set("size", Number(e.target.value) / 100)}
              className="w-full accent-amber-600"
              aria-label="Words size"
            />
          </div>

          {/* Style */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Style</p>
            <div className="flex flex-wrap gap-2">
              {THUMB_TEXT_STYLES.map((t: { id: ThumbTextStyle; label: string }) => (
                <Chip key={t.id} on={style.textStyle === t.id} onClick={() => set("textStyle", t.id)}>{t.label}</Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Outline has a dark edge. Plain has none. Box sets each line on a block in the colour below.
            </p>
          </div>

          {/* Colour */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Colour</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => set("color", null)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${style.color === null ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                Default
              </button>
              {[...brandColors, ...THUMB_COLOURS.filter((c) => !brandColors.includes(c))].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  aria-label={`Colour ${c}`}
                  aria-pressed={style.color === c}
                  className={`h-7 w-7 rounded-full border border-slate-300 ${style.color === c ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={style.color ?? "#ffffff"}
                onChange={(e) => set("color", e.target.value)}
                aria-label="Any colour"
                className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              />
            </div>
            {brandColors.length === 0 && (
              <p className="mt-1.5 text-[11px] text-slate-400">Add your brand colours in Settings to see them first here.</p>
            )}
          </div>

          {props.children && (
            <div className="border-t border-slate-100 pt-4">{props.children}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={props.busy || savingHeadline || !words.trim()}
            onClick={() => void apply()}
            className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {props.busy ? "Drawing…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${on ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
    >
      {children}
    </button>
  );
}
