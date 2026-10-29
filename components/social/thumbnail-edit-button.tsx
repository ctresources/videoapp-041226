"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { ThumbnailEditor, type ThumbApply } from "@/components/social/thumbnail-editor";
import { cleanThumbStyle } from "@/lib/utils/thumbnail-style";

/**
 * Edit thumbnail, the same everywhere (2026-10-26, the owner's approved
 * mockup): the AutoSparks card, My Sparks and the video editor open the one
 * editor and save the result to the project, which is what posting uses.
 * The editor shows both the thumbnail words and the full headline
 * (2026-10-29), and saves the headline itself when it changes.
 */
export function ThumbnailEditButton(props: {
  projectId: string;
  /** Listing photos on the project, offered as backgrounds. */
  photos?: string[];
  /** The project's seo_data, for the words and style it was last built with. */
  seo?: { thumbnail_headline?: unknown; thumbnail_style?: unknown; thumbnail_scene?: unknown } | null;
  city?: string | null;
  state?: string | null;
  className?: string;
  onDone?: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const seo = props.seo ?? {};

  async function apply(next: ThumbApply) {
    setBusy(true);
    try {
      const res = await fetch("/api/tools/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: props.projectId,
          headline: next.headline,
          style: next.style,
          photoSide: next.photoSide,
          ...(next.backgroundUrl ? { backgroundUrl: next.backgroundUrl } : {}),
          ...(next.photoUrl ? { photoUrl: next.photoUrl } : {}),
          ...(next.noMarket ? { noMarket: true } : { city: next.city || undefined, state: next.state || undefined }),
          ...(next.scene ? { scene: next.scene } : {}),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error || "Couldn't update the thumbnail.");
      toast.success("Thumbnail updated.");
      setOpen(false);
      if (out?.url) props.onDone?.(out.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the thumbnail.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} loading={busy} className={props.className}>
        Edit thumbnail
      </Button>
      {open && (
        <ThumbnailEditor
          projectId={props.projectId}
          photos={props.photos ?? []}
          headline={typeof seo.thumbnail_headline === "string" ? seo.thumbnail_headline : ""}
          style={cleanThumbStyle(seo.thumbnail_style)}
          scene={typeof seo.thumbnail_scene === "string" ? seo.thumbnail_scene : undefined}
          badgeCity={props.city ?? undefined}
          badgeState={props.state ?? undefined}
          currentBg={null}
          busy={busy}
          onClose={() => setOpen(false)}
          onApply={(next) => void apply(next)}
        />
      )}
    </>
  );
}
