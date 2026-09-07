/**
 * Where a project's generated thumbnail can be viewed.
 *
 * Its own module, deliberately: the thing that RENDERS the card reads font
 * files off disk and imports next/og, so a client component that only needs
 * the address would drag `fs` into the browser bundle and fail the build.
 *
 * Derived, never stored. The old value was written into seo_data at script
 * time with the hook inside the query string, which meant editing the hook
 * afterwards left the thumbnail showing the original wording with nothing on
 * screen saying why.
 *
 * A real uploaded PNG (renderAndSaveThumbnail) still wins wherever one exists.
 * This is the fallback preview, not a replacement for it.
 */
export function projectThumbnailUrl(projectId: string): string {
  return `/api/thumbnail?project=${encodeURIComponent(projectId)}`;
}
