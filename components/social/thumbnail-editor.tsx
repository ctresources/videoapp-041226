"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2, Upload, X } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/utils/upload-image";
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
  /**
   * Offer "Photo on it": the headshot, the avatar looks, or an upload
   * (2026-10-26, the owner's ask). Off where the caller has its own picker.
   */
  showPerson?: boolean;
  /** photoUrl is set only when the person was changed here. */
  onApply: (next: { backgroundUrl: string; headline: string; style: ThumbStyle; photoUrl?: string }) => void;
  onClose: () => void;
}) {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [framesError, setFramesError] = useState<string | null>(null);
  const [bg, setBg] = useState<string | null>(props.currentBg);
  const [words, setWords] = useState(props.headline);
  const [style, setStyle] = useState<ThumbStyle>(props.style);
  /** The agent's brand colours from Settings, offered first. */
  const [brandColors, setBrandColors] = useState<string[]>([]);
  /** The person on it: "" keeps whoever it was built with. */
  const [person, setPerson] = useState("");
  const [people, setPeople] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from("profiles").select("brand_colors, avatar_url").eq("id", user.id).maybeSingle();
      const row = data as { brand_colors: string[] | null; avatar_url: string | null } | null;
      setBrandColors((row?.brand_colors ?? []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)));
      if (props.showPerson && row?.avatar_url) {
        const headshot = row.avatar_url;
        setPeople((p) => (p.some((x) => x.url === headshot) ? p : [{ url: headshot, name: "Your headshot" }, ...p]));
      }
    });
  }, [props.showPerson]);

  // The avatar looks, as more choices of who is on it.
  useEffect(() => {
    if (!props.showPerson) return;
    fetch("/api/avatar/looks")
      .then((r) => (r.ok ? r.json() : { looks: [] }))
      .then((d) => {
        const looks = ((d.looks ?? []) as { name: string; preview_image_url: string | null }[])
          .filter((l): l is { name: string; preview_image_url: string } => !!l.preview_image_url)
          .map((l) => ({ url: l.preview_image_url, name: l.name }));
        setPeople((p) => [...p, ...looks.filter((l) => !p.some((x) => x.url === l.url))]);
      })
      .catch(() => {});
  }, [props.showPerson]);

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

  const options = [...(frames ?? []).map((f) => f.url), ...props.photos];
  const shown = bg ?? options[0] ?? null;
  const colour = style.color ?? "#ffffff";

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
      <div className="flex w-full max-w-2xl flex-col overflow-hidden bg-white sm:rounded-2xl sm:shadow-xl">
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
              {person && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={person} alt="" className="absolute bottom-0 right-[4%] h-[88%] w-auto rounded-t-xl object-cover" />
              )}
              <div className="absolute bottom-[12%] left-[6%] right-[38%] text-left">
                <span style={previewWords}>{words.trim() || "Your words"}</span>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">The preview is approximate. Apply draws the exact thumbnail.</p>
          </div>

          {/* Background */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Background</p>
            {!frames && !framesError && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 size={12} className="animate-spin" /> Taking stills from your video…
              </p>
            )}
            {framesError && <p className="text-xs text-amber-700">{framesError}</p>}
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
            {props.projectId && (
              <p className="mt-1.5 text-[11px] text-slate-400">The first pictures are stills from your video. Pick a moment you like.</p>
            )}
          </div>

          {/* Who is on it (2026-10-26, the owner's ask). */}
          {props.showPerson && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Photo on it</p>
              <div className="flex flex-wrap items-center gap-2">
                {people.map((p) => (
                  <button
                    key={p.url}
                    type="button"
                    onClick={() => setPerson(p.url)}
                    title={p.name}
                    aria-pressed={person === p.url}
                    className={`h-14 w-14 overflow-hidden rounded-full border-2 ${person === p.url ? "border-amber-500" : "border-transparent hover:border-slate-300"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  </button>
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
                {person ? "This photo goes on the thumbnail when you press Apply." : "Leave it and the thumbnail keeps the photo it has."}
              </p>
            </div>
          )}

          {/* Words */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Words</p>
            <input
              value={words}
              onChange={(e) => setWords(e.target.value)}
              maxLength={60}
              placeholder="Three or four short words"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold uppercase focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

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
            disabled={props.busy || !words.trim()}
            onClick={() => props.onApply({ backgroundUrl: shown ?? "", headline: words.trim(), style, ...(person ? { photoUrl: person } : {}) })}
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
