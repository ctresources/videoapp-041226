/**
 * Which container the browser should record in.
 *
 * MP4 first, deliberately. Both recorders used to list WebM first and MP4 as
 * an afterthought, so every browser capable of either chose WebM — and no
 * iPhone can decode WebM at all. That made every video recorded on a desktop
 * unplayable on a phone, including for whoever an agent shared the link with.
 * Safari only supports MP4 here, which is why recordings made on a phone were
 * never the problem.
 *
 * Nothing is lost by asking: a browser without MP4 recording falls through to
 * exactly the WebM it would have picked anyway.
 */
const CANDIDATES = [
  // Explicit codecs first — some builds report the bare type unsupported while
  // accepting a fully specified one. H.264 baseline + AAC is the pair iOS
  // decodes without argument.
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/**
 * The best supported recording type, or "" if none of them are — in which case
 * the caller should omit mimeType entirely and let the browser decide rather
 * than force a type it has just said it cannot write.
 */
export function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * What was actually recorded, which is not always what was asked for.
 *
 * Both recorders used to label the finished blob with the type they requested,
 * or a hardcoded "video/webm" when they requested nothing. The upload derives
 * the file extension and content-type from that label, so a browser that
 * quietly recorded MP4 had its file stored as `.webm` served as video/webm —
 * and iOS then refused to play a recording it had made itself. `recorder.mimeType`
 * is set once recording starts and is the only honest answer.
 */
export function recordedType(recorder: MediaRecorder, requested: string): string {
  return recorder.mimeType || requested || "video/webm";
}
