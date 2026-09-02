/**
 * How many photos each render path will actually use.
 *
 * These are render-time budgets, not costs — HeyGen bills on the finished
 * video's length, so an extra photo is free. What it buys is processing time,
 * and the Video Agent has to plan a scene around every file it is given.
 *
 * The numbers live here because three places have to agree about them: the
 * upload counter, the warning under it, and the two slices in create-blog. When
 * they disagreed, the UI offered twelve and the render silently used five.
 */

/**
 * Video Agent (every AI-written short).
 *
 * Was 5, which is where "I uploaded twelve and it used five" came from. Raised
 * to 8 rather than 12 deliberately: a 2:14 render already takes ~9 minutes and
 * the job auto-fails at 30, so the headroom is real but not unlimited. If 8
 * renders comfortably, 12 is the next step — and the figure to change is this
 * one, nothing else.
 */
export const AGENT_PHOTO_LIMIT = 8;

/**
 * Direct Video (pasted scripts and long-form).
 *
 * Higher because the avatar is composited over the photos afterwards rather
 * than HeyGen planning a scene per file, so the extra ones cost almost nothing.
 */
export const DIRECT_PHOTO_LIMIT = 12;

/** What the upload widget accepts — the larger of the two, so no path is capped by the UI. */
export const UPLOAD_PHOTO_LIMIT = DIRECT_PHOTO_LIMIT;
