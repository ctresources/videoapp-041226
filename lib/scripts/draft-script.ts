/**
 * The fields a draft save writes onto a project's ai_script. Moved out of
 * /api/project/save-draft unchanged (2026-11-25) so an AI app's set_script
 * saves the agent's own words the same way the editor does: reused, never
 * copied. The route's notes on each field still apply.
 */

export interface DraftFields {
  script?: string;
  cta?: string;
  /** "No call to action": the wording is kept, and not spoken. */
  ctaOff?: boolean;
  /** The closing line was typed over in this video, so it is kept as typed. */
  ctaEdited?: boolean;
  hook?: string;
  /** reel_9x16 | youtube_16x9 | youtube_long — the shape picker. */
  videoType?: string;
  /** Photo grid, IN ORDER. The render takes the first twelve of these. */
  photoUrls?: unknown;
  musicId?: string;
  musicUrl?: string | null;
  captions?: boolean;
  renderMode?: string;
  lookId?: string;
  avatarStyle?: string;
}

export function draftScriptPatch(aiScript: Record<string, unknown>, f: DraftFields): Record<string, unknown> {
  const { script, cta, ctaOff, ctaEdited, hook, videoType, photoUrls, musicId, musicUrl, captions, renderMode, lookId, avatarStyle } = f;
  return {
    ...aiScript,
    ...(script !== undefined && { script }),
    ...(cta !== undefined && { cta }),
    ...(typeof ctaOff === "boolean" && { cta_off: ctaOff }),
    /**
     * Whether the closing line is this video's own or the one from Settings.
     *
     * A saved draft used to keep its copy of the closing line for good, so a
     * CTA changed in Settings never reached a video already begun, and any
     * save made it "begun": pressing a tile on the setup screen is one. Now
     * the editor says whether the box was typed in. When it does not say and
     * this is the project's first save, nobody has typed anything yet, so it
     * follows Settings. A draft saved before this existed is left unmarked,
     * since there is no telling which it was; the editor keeps its wording
     * and offers the one from Settings.
     */
    ...(typeof ctaEdited === "boolean"
      ? { cta_edited: ctaEdited }
      : aiScript.cta_edited === undefined && aiScript.user_edited !== true
        ? { cta_edited: false }
        : {}),
    ...(hook !== undefined && { hook }),
    // The setup screen's own choices. video_platform is the existing key the
    // editor already reads on load, so the shape rejoins the field it was
    // always meant to live in rather than gaining a second one.
    ...(videoType === "reel_9x16" || videoType === "short_1x1"
      ? { video_platform: "reel", video_length: "standard" }
      : videoType === "youtube_16x9"
        ? { video_platform: "youtube", video_length: "standard" }
        : videoType === "youtube_long"
          ? { video_platform: "youtube", video_length: "long" }
          : {}),
    ...(Array.isArray(photoUrls) && {
      draft_photo_urls: (photoUrls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.startsWith("http"),
      ),
    }),
    ...(musicId !== undefined && { draft_music_id: musicId }),
    ...(musicUrl !== undefined && { draft_music_url: musicUrl }),
    ...(captions !== undefined && { draft_captions: captions }),
    ...(renderMode === "voice_only" || renderMode === "avatar_voice"
      ? { render_mode: renderMode }
      : {}),
    ...(lookId !== undefined && { draft_look_id: lookId }),
    ...(avatarStyle === "full" || avatarStyle === "circle" ? { avatar_style: avatarStyle } : {}),
    // Marks that these values were saved by the user — the editor prefers them
    // over the resolved default CTA / first suggested hook when reloading.
    user_edited: true,
  };
}
