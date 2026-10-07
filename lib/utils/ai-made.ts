/**
 * Whether a video was made with generative AI in a way a viewer could take for
 * real footage, and the sentence that says so.
 *
 * Two kinds are: a render with an AI avatar speaking, and a Cinematic reel,
 * whose camera movement is generated from still photos. A camera recording and
 * a classic photo reel are not: nothing in them is synthesised.
 *
 * Asked in one place because three things depend on the answer agreeing: the
 * setting YouTube asks for at upload, the flag other platforms ask for, and
 * the line in the description.
 */
export function isAiMadeVideo(video: {
  render_provider?: string | null;
  metadata?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!video) return false;
  if (video.render_provider?.startsWith("heygen")) return true;
  return video.metadata?.motion === "cinematic";
}

/** Goes at the end of a Cinematic reel's description. The owner chose the description, not the picture, as where this is said. */
export const CINEMATIC_DISCLOSURE = "Photos animated with AI.";
