/** Shared by the editor outline, raster renderer and editable PDF export. */
export const YOUTUBE_BANNER = {
  width: 2560,
  height: 1440,
  safe: { x: 507, y: 508.5, width: 1546, height: 423 },
} as const;

export const YOUTUBE_SAFE_ZONE_STYLE = {
  left: `${YOUTUBE_BANNER.safe.x / YOUTUBE_BANNER.width * 100}%`,
  top: `${YOUTUBE_BANNER.safe.y / YOUTUBE_BANNER.height * 100}%`,
  width: `${YOUTUBE_BANNER.safe.width / YOUTUBE_BANNER.width * 100}%`,
  height: `${YOUTUBE_BANNER.safe.height / YOUTUBE_BANNER.height * 100}%`,
};

/** A full-canvas image positioned inside an aspect-ratio safe-zone viewport. */
export const YOUTUBE_MOBILE_PREVIEW_STYLE = {
  width: `${YOUTUBE_BANNER.width / YOUTUBE_BANNER.safe.width * 100}%`,
  maxWidth: "none",
  left: `${-YOUTUBE_BANNER.safe.x / YOUTUBE_BANNER.safe.width * 100}%`,
  top: `${-YOUTUBE_BANNER.safe.y / YOUTUBE_BANNER.safe.height * 100}%`,
};
