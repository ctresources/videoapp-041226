/**
 * What the agent asked to see on screen (2026-11-23, after the first live
 * ChatGPT test showed a plan had nowhere to carry it). One short line: it goes
 * into the Video Agent's prompt, which has a hard size limit the script needs.
 */
export const VISUAL_DIRECTION_MAX = 280;

export function cleanVisualDirection(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const line = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/["“”`]/g, "'").replace(/\s{2,}/g, " ").trim();
  if (line.length <= VISUAL_DIRECTION_MAX) return line;
  const cut = line.slice(0, VISUAL_DIRECTION_MAX);
  const space = cut.lastIndexOf(" ");
  return (space > 180 ? cut.slice(0, space) : cut).trim();
}

/** Below this, a cut-down direction would say nothing useful. */
const MIN_USEFUL = 40;

/**
 * Fits the direction into the room the script leaves. The script always comes
 * first. Empty means there was no room; a shorter string means part of it fit.
 */
export function fitVisualDirection(direction: string, room: number): string {
  if (direction.length <= room) return direction;
  if (room < MIN_USEFUL) return "";
  const cut = direction.slice(0, room);
  const space = cut.lastIndexOf(" ");
  const fitted = (space >= MIN_USEFUL ? cut.slice(0, space) : cut).trim();
  return fitted.length >= MIN_USEFUL ? fitted : "";
}

/** The prompt's on-screen block: short, because it shares a hard limit with the script. */
export const visualDirectionBlock = (direction: string, hasImages: boolean) =>
  `ON-SCREEN (RULE #4): show "${direction}" where it fits.${hasImages ? " Use every attached image." : ""} Visuals only. Never invent a website, app or logo: use an attached image or a plain text card.\n\n`;
