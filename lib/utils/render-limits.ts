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
 * Was 5, then 8, now the same 12 the upload grid offers — so what the app takes
 * and what it shows finally agree, and a listing's twelve photos are twelve
 * photos.
 *
 * 5 and 8 were both render-time hedges: the job auto-fails at 30 minutes and
 * more files mean more scene planning. Measured renders have come in at 9 to 13
 * minutes, so there is room, but this is the number to drop first if a render
 * ever times out — nothing else has to change.
 *
 * The count was never the reason only five appeared, though. That was the
 * 50/50 presenter split in create-blog, which left 45 seconds of photo time on
 * a 90-second video. Listings now ask for 30/70, which is ~64 seconds, or
 * about 5 seconds each across twelve.
 */
export const AGENT_PHOTO_LIMIT = 12;

/**
 * Direct Video (pasted scripts and long-form).
 *
 * Higher because the avatar is composited over the photos afterwards rather
 * than HeyGen planning a scene per file, so the extra ones cost almost nothing.
 */
export const DIRECT_PHOTO_LIMIT = 12;

/** What the upload widget accepts — the larger of the two, so no path is capped by the UI. */
export const UPLOAD_PHOTO_LIMIT = DIRECT_PHOTO_LIMIT;
