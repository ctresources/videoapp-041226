/**
 * The sessionStorage key Seller Update leaves when it opens the camera for a
 * video update (2026-10-15): { listingId, updateOn, address }. Spark Studio
 * reads it to show "Recording a video update for …" and, once the take saves,
 * "Add to the seller update". Its own module so Spark Studio doesn't pull in
 * the whole Seller Update screen to read one name.
 */
export const SELLER_VIDEO_RETURN = "seller-video-return";
