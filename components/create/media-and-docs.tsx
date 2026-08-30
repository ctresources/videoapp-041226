"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon, Plus, X, Loader2, Paperclip, FileText, Globe,
} from "lucide-react";

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
export interface DocAttachment {
  mode: "upload" | "url";
  onModeChange: (mode: "upload" | "url") => void;
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
              · JPG, PNG, WEBP · max 15 MB each
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
                className={`relative w-16 h-16 rounded-xl overflow-hidden border shrink-0 group transition-all ${
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
                {/* The play order, which is also the order they are spoken
                    over — the number is the point of being able to drag. */}
                <span className="absolute bottom-0 left-0 px-1 text-[9px] font-bold text-white bg-black/60 rounded-tr">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  aria-label={`Remove ${photo.name}`}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ))}
            {room > 0 && (
              <label
                title={`Add ${room} more`}
                className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
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
              {onReorderPhotos ? "Drag to reorder · " : ""}
              {room > 0 ? `${room} more can be added` : "all slots full — remove one to swap it out"}
            </p>
          </div>
        )}
      </div>

      {/* ── Doc / URL ──────────────────────────────────────────────────── */}
      {doc && (
        <div className="mb-4 pb-4 border-b border-spark-rule-soft">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-spark-ink-soft">
              Attach PDF / URL <span className="font-normal text-spark-ink-faint">(optional)</span>
            </p>
            <div className="flex rounded-lg overflow-hidden border border-spark-rule text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => doc.onModeChange("upload")}
                className={`px-2.5 py-1 transition-colors ${
                  doc.mode === "upload" ? "bg-spark-amber text-white" : "bg-white text-spark-ink-muted hover:bg-spark-paper"
                }`}
              >
                Upload PDF
              </button>
              <button
                type="button"
                onClick={() => doc.onModeChange("url")}
                className={`px-2.5 py-1 transition-colors ${
                  doc.mode === "url" ? "bg-spark-amber text-white" : "bg-white text-spark-ink-muted hover:bg-spark-paper"
                }`}
              >
                Add URL
              </button>
            </div>
          </div>

          {doc.attached ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              {doc.mode === "upload"
                ? <FileText size={16} className="text-green-600 shrink-0" />
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

          <p className="text-[11px] text-spark-ink-faint mt-1">
            {doc.mode === "upload"
              ? "PDF content will be extracted and used to enrich your video."
              : "Web page content will be extracted and used to enrich your video."}
          </p>
        </div>
      )}
    </>
  );
}
