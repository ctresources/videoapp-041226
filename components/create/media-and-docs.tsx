"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon, Plus, X, Loader2, Paperclip, FileText, Globe, Mail,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { EmailImportPicker, type PickedEmailArticle } from "@/components/create/email-import-picker";

export interface MediaPhoto {
  url: string;
  name: string;
  preview: string;
}

/**
 * The doc/URL half. Optional — a caller that only wants photos omits it, and
 * the block is not rendered at all.
 *
 * This is an ENRICHMENT attachment: whatever text is extracted is fed to the
 * script writer as background. It is deliberately not the same thing as the
 * listing tab's Import, which fills a structured form from a listing page.
 * They look alike and do different jobs, which is exactly why they are not
 * being merged into one control.
 */
/**
 * Which way the source material is coming in. "email" is the same idea as the
 * other two — text from somewhere else — reached by forwarding rather than by
 * finding a file or a link, which is how an article usually arrives in the first
 * place.
 */
export type DocMode = "upload" | "url" | "email" | "text";

export interface DocAttachment {
  mode: DocMode;
  onModeChange: (mode: DocMode) => void;
  /** Set once something is attached — the name shown in the confirmed state. */
  attachedName: string;
  attached: boolean;
  onClear: () => void;
  uploading: boolean;
  onUploadPdf: (file: File) => void;
  urlInput: string;
  onUrlInputChange: (value: string) => void;
  onFetchUrl: () => void;
  fetching: boolean;
  /**
   * Called with an article the agent forwarded to their import address. Omit
   * and the "From email" way in is not offered at all — which is what happens
   * on any screen that has nothing to do with it.
   */
  onPickEmail?: (article: PickedEmailArticle) => void;
  /**
   * Called with writing the agent pasted in directly. Omit and the "Paste
   * text" way in is not offered — it belongs where the result is an article
   * (there the paste IS the source), not where a pasted script would simply be
   * spoken, which the script box already handles.
   */
  onPasteText?: (text: string) => void;
}

interface Props {
  photos: MediaPhoto[];
  onAddPhotos: (files: FileList) => void;
  onRemovePhoto: (index: number) => void;
  /**
   * Move a photo. Omit and the grid is not draggable.
   *
   * Order is not decoration: b-roll plays the array in order and follows the
   * reader's position in the script, so photo 1 is on screen for the opening
   * line. Without this the only way to put the kitchen shot next to the
   * kitchen sentence was to delete everything after it and re-upload.
   */
  onReorderPhotos?: (from: number, to: number) => void;
  photosUploading: boolean;
  maxPhotos?: number;
  /** Omit to render photos only. */
  doc?: DocAttachment;
  /** Shown under the heading — what these photos will be used for here. */
  blurb?: string;
}

/**
 * Photos-as-b-roll plus an optional doc/URL attachment.
 *
 * This existed three times: once on the paste tab, once on the camera tab
 * (a line-for-line copy with `camera` swapped for `paste`), and a third,
 * differently-designed one inside the listing form. They had already drifted —
 * different affordances, different copy, different stated limits, and a bug
 * fixed in one that was still live in another.
 *
 * The empty state is the listing form's, which explains itself; the populated
 * state is the paste tab's compact grid, which does not waste space once there
 * is something to show. Neither tab had both.
 */
export function MediaAndDocs({
  photos,
  onAddPhotos,
  onRemovePhoto,
  onReorderPhotos,
  photosUploading,
  maxPhotos = 12,
  doc,
  blurb = "Photos become b-roll · a PDF or URL feeds the script",
}: Props) {
  const room = maxPhotos - photos.length;
  // Which tile is being dragged, and which one it is currently over. Held here
  // rather than on the DOM so the drop target can be shown before the drop.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-spark-amber to-fuchsia-500 text-white flex items-center justify-center shrink-0 shadow-sm">
          <ImageIcon size={17} />
        </span>
        <div>
          <p className="text-base font-bold text-brand-text">
            Media &amp; PDF <span className="text-sm font-normal text-spark-ink-faint">(Optional)</span>
          </p>
          <p className="text-sm text-spark-ink-muted">{blurb}</p>
        </div>
      </div>

      {/* ── Photos ─────────────────────────────────────────────────────── */}
      <div className={`mb-4 pb-4 ${doc ? "border-b border-spark-rule-soft" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-spark-ink-soft">
            Photos <span className="font-normal text-spark-ink-faint">(optional · up to {maxPhotos} · used as b-roll)</span>
          </p>
          {photos.length > 0 && (
            <span className="text-xs text-spark-ink-faint">{photos.length}/{maxPhotos}</span>
          )}
        </div>

        {photos.length === 0 ? (
          // Explains itself while there is nothing to look at. A bare "+" tile
          // said nothing about how many, what formats, or what they are for.
          <label
            className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${
              photosUploading
                ? "border-spark-rule-dim bg-spark-amber-tint"
                : "border-spark-rule hover:border-spark-rule-dim"
            }`}
          >
            {photosUploading
              ? <Loader2 size={20} className="text-spark-amber animate-spin" />
              : <ImageIcon size={20} className="text-spark-ink-faint" />}
            <span className="text-sm font-semibold text-spark-ink-soft">
              {photosUploading ? "Uploading…" : `Select up to ${maxPhotos} photos at once`}
            </span>
            <span className="text-[11px] text-spark-ink-faint">
              Hold <strong>Cmd</strong> (Mac) or <strong>Ctrl</strong> (Windows) to pick multiple
              · JPG, PNG, WEBP · max 25 MB each
            </span>
            <input
              type="file" accept="image/*" multiple className="sr-only"
              disabled={photosUploading}
              onChange={(e) => { if (e.target.files?.length) onAddPhotos(e.target.files); }}
            />
          </label>
        ) : (
          <div className="flex flex-wrap gap-2">
            {photos.map((photo, i) => (
              <div
                key={`${photo.url}-${i}`}
                /* Dragging is a pointer-device convenience layered on top of
                   the arrows below. HTML5 drag events never fire on touch, so
                   on a phone this attribute simply does nothing — which is why
                   the arrows are the real mechanism rather than a fallback. */
                draggable={!!onReorderPhotos}
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                onDragOver={(e) => {
                  if (!onReorderPhotos || dragFrom === null) return;
                  e.preventDefault();          // without this the drop never fires
                  setDragOver(i);
                }}
                onDrop={(e) => {
                  if (!onReorderPhotos || dragFrom === null) return;
                  e.preventDefault();
                  if (dragFrom !== i) onReorderPhotos(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={`relative w-20 h-20 rounded-xl overflow-hidden border shrink-0 group transition-all ${
                  onReorderPhotos ? "cursor-grab active:cursor-grabbing" : ""
                } ${
                  dragOver === i && dragFrom !== i
                    ? "border-spark-amber ring-2 ring-spark-amber"
                    : "border-spark-rule"
                } ${dragFrom === i ? "opacity-40" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt={photo.name}
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                />

                {/* Play order — the order they are spoken over. */}
                <span className="absolute top-0 left-0 px-1 text-[9px] font-bold text-white bg-black/60 rounded-br pointer-events-none">
                  {i + 1}
                </span>

                {/* Remove. Its own corner rather than the whole tile, so the
                    tile can carry the move controls too. */}
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  aria-label={`Remove ${photo.name}`}
                  className="absolute top-0 right-0 p-1 bg-black/55 hover:bg-red-500 rounded-bl transition-colors"
                >
                  <X size={12} className="text-white" />
                </button>

                {/* Move left / right.
                    These are the reorder mechanism, not a fallback: HTML5
                    drag does not exist on touch, and the agents using this
                    are on phones. Kept visible without hover for the same
                    reason — the remove button was hover-gated, which on a
                    phone meant it could not be relied on either. */}
                {onReorderPhotos && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/70 to-transparent">
                    <button
                      type="button"
                      onClick={() => onReorderPhotos(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Move ${photo.name} earlier`}
                      className="p-1 text-white disabled:opacity-25 enabled:hover:text-spark-amber"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onReorderPhotos(i, i + 1)}
                      disabled={i === photos.length - 1}
                      aria-label={`Move ${photo.name} later`}
                      className="p-1 text-white disabled:opacity-25 enabled:hover:text-spark-amber"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {room > 0 && (
              <label
                title={`Add ${room} more`}
                className={`w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                  photosUploading
                    ? "border-spark-rule-dim bg-spark-amber-tint"
                    : "border-spark-rule hover:border-spark-rule-dim"
                }`}
              >
                {photosUploading
                  ? <Loader2 size={18} className="text-spark-amber animate-spin" />
                  : <Plus size={18} className="text-spark-ink-faint" />}
                <input
                  type="file" accept="image/*" multiple className="sr-only"
                  disabled={photosUploading}
                  onChange={(e) => { if (e.target.files?.length) onAddPhotos(e.target.files); }}
                />
              </label>
            )}
            {/* The count is in the header; this says what is left to add. */}
            <p className="text-[11px] text-spark-ink-faint self-center ml-1">
              {onReorderPhotos ? "Arrows reorder · drag works too on a computer · " : ""}
              {room > 0 ? `${room} more can be added` : "all slots full — remove one to swap it out"}
            </p>
          </div>
        )}
      </div>

      {/* ── Doc / URL ──────────────────────────────────────────────────── */}
      {doc && <ArticleSource doc={doc} />}
    </>
  );
}

/**
 * Where source material comes in: a PDF, a link, or an email you forwarded.
 *
 * Its own export because it belongs at the TOP of a card, not the bottom.
 * Sitting inside the media block it came after the script box it feeds — so
 * the way to avoid writing a script by hand was below the empty box you were
 * being asked to write in, under a heading about photos. Photos are output
 * (b-roll); this is input, and the order on screen now says so.
 *
 * MediaAndDocs still renders it when given a `doc`, so a caller that wants
 * both in one block is unchanged.
 */
export function ArticleSource({
  doc,
  /** Sets the heading and the one line under it — what this feeds, in context. */
  purpose = "script",
}: {
  doc: DocAttachment;
  purpose?: "script" | "article";
}) {
  return (
        <div className="mb-4 pb-4 border-b border-spark-rule-soft">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <p className="text-sm font-bold text-spark-ink-soft">
              {doc.onPickEmail ? "Start from something you already have" : "Attach PDF / URL"}{" "}
              <span className="font-normal text-spark-ink-faint">(optional)</span>
            </p>
            <div className="flex rounded-lg overflow-hidden border border-spark-rule text-[11px] font-semibold">
              {([
                // First where it exists: pasting your own writing is the
                // shortest route of the four and needs nothing set up.
                ...(doc.onPasteText ? [{ key: "text" as const, label: "Paste text" }] : []),
                { key: "upload" as const, label: "Upload PDF" },
                { key: "url" as const, label: "Add URL" },
                // Last, and only where the caller handles it.
                ...(doc.onPickEmail ? [{ key: "email" as const, label: "From email" }] : []),
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => doc.onModeChange(key)}
                  aria-pressed={doc.mode === key}
                  className={`px-2.5 py-1 transition-colors ${
                    doc.mode === key ? "bg-spark-amber text-white" : "bg-white text-spark-ink-muted hover:bg-spark-paper"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Says what the three buttons are FOR before you press one. Without
              it the row read as three file-upload options rather than as three
              ways to avoid writing from scratch. */}
          {doc.onPickEmail && (
            <p className="text-[11px] leading-[1.5] text-spark-ink-muted mb-2">
              Already have the piece written?{" "}
              {doc.onPasteText ? <><strong>Paste it in</strong>, attach a </> : <>Attach a </>}
              <strong>PDF</strong>, paste its <strong>link</strong>, or forward it to your own
              SparkReels <strong>email address</strong> — we&apos;ll turn it into
              {purpose === "article" ? " your article" : " your script"}.
            </p>
          )}

          {doc.attached ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              {doc.mode === "upload"
                ? <FileText size={16} className="text-green-600 shrink-0" />
                : doc.mode === "email"
                  ? <Mail size={16} className="text-green-600 shrink-0" />
                  : <Globe size={16} className="text-green-600 shrink-0" />}
              <span className="text-sm text-green-800 flex-1 truncate">{doc.attachedName}</span>
              <button type="button" onClick={doc.onClear} aria-label="Remove attachment" className="p-0.5 rounded hover:bg-green-100">
                <X size={14} className="text-green-700" />
              </button>
            </div>
          ) : doc.mode === "upload" ? (
            <label
              className={`flex items-center gap-2 p-3 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                doc.uploading ? "border-spark-rule-dim bg-spark-amber-tint" : "border-spark-rule hover:border-spark-rule-dim"
              }`}
            >
              {doc.uploading
                ? <Loader2 size={16} className="text-spark-amber animate-spin shrink-0" />
                : <Paperclip size={16} className="text-spark-ink-faint shrink-0" />}
              <span className="text-sm text-spark-ink-muted">
                {doc.uploading ? "Extracting PDF content…" : "Click to attach a PDF"}
              </span>
              <input
                type="file" accept=".pdf,application/pdf" className="sr-only"
                disabled={doc.uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) doc.onUploadPdf(f); }}
              />
            </label>
          ) : doc.mode === "email" && doc.onPickEmail ? (
            <EmailImportPicker onPick={doc.onPickEmail} />
          ) : doc.mode === "text" && doc.onPasteText ? (
            <PasteTextSource onUse={doc.onPasteText} purpose={purpose} />
          ) : (
            <div className="flex gap-2">
              <input
                type="url"
                value={doc.urlInput}
                onChange={(e) => doc.onUrlInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !doc.fetching && doc.urlInput.trim()) doc.onFetchUrl();
                }}
                placeholder="https://example.com/article"
                className="flex-1 text-sm px-3 py-2 border border-spark-rule rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
              <Button
                size="sm"
                loading={doc.fetching}
                disabled={!doc.urlInput.trim()}
                onClick={doc.onFetchUrl}
                className="whitespace-nowrap"
              >
                Fetch
              </Button>
            </div>
          )}

          {/* The email picker says its own piece — the address, the 30 days, and
              what to forward — so a line here would only repeat it. */}
          {/* Says what THIS way in does, on the route it is actually on.
              Paste text showed "Web page content will be extracted" — nothing
              is fetched, and on the blog route no video is made either. */}
          {(doc.mode === "upload" || doc.mode === "url") && (
            <p className="text-[11px] text-spark-ink-faint mt-1">
              {doc.mode === "upload"
                ? `PDF content will be extracted${purpose === "article" ? " and used to write your article." : " and used to enrich your video."}`
                : `Web page content will be extracted${purpose === "article" ? " and used to write your article." : " and used to enrich your video."}`}
            </p>
          )}
        </div>
  );
}

/**
 * Writing the agent already has, pasted straight in.
 *
 * Held locally until Use, so the draft can be edited without the page around
 * it reacting to every keystroke — and so what gets committed is one deliberate
 * act rather than a field that quietly became the source of an article.
 *
 * The floor is characters rather than words because it is only there to stop an
 * empty or one-line paste becoming the brief; anything real clears it easily.
 */
const MIN_PASTE_CHARS = 200;

function PasteTextSource({
  onUse,
  purpose,
}: {
  onUse: (text: string) => void;
  purpose: "script" | "article";
}) {
  const [draft, setDraft] = useState("");
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const short = draft.trim().length > 0 && draft.trim().length < MIN_PASTE_CHARS;

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        placeholder={
          purpose === "article"
            ? "Paste anything you've already written — a draft, a past post, your notes, a script. We'll turn it into a full article."
            : "Paste the writing you want this built from."
        }
        className="w-full text-sm px-3 py-2.5 border border-spark-rule rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={draft.trim().length < MIN_PASTE_CHARS}
          onClick={() => onUse(draft.trim())}
          className="whitespace-nowrap"
        >
          Use this text
        </Button>
        {words > 0 && (
          <span className="text-[11px] text-spark-ink-faint">
            {words.toLocaleString()} words{short ? " · paste a little more to use it" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
