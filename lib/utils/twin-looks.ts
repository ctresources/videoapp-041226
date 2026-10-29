/**
 * Which looks are the agent's Digital Twin (2026-10-28).
 *
 * The twin itself (heygen_digital_twin_look_id) plus any AI outfits made from
 * it (twin_outfit_look_ids). HeyGen animates an outfit with the twin's own
 * motion, so everything that applies to the twin applies to its outfits: the
 * one-time approval, Avatar video being a paid-plan feature, and the full-size
 * background in horizontal videos.
 */
export interface TwinLookFields {
  heygen_digital_twin_look_id?: string | null;
  /** The second twin, the other shape (2026-10-29, paid plans). */
  heygen_twin2_look_id?: string | null;
  twin_outfit_look_ids?: string[] | null;
}

export function twinLookIds(p: TwinLookFields | null | undefined): string[] {
  if (!p) return [];
  return [p.heygen_digital_twin_look_id, p.heygen_twin2_look_id, ...(p.twin_outfit_look_ids ?? [])]
    .filter((x): x is string => !!x);
}

/**
 * Which of an account's two Digital Twins a video uses (2026-10-29): the one
 * whose shape fits the video. Upright = filmed with the phone upright;
 * unknown (null) counts as upright. A free account only ever gets its first
 * twin. Neither fitting keeps the one asked for.
 */
export function pickTwin(a: {
  asked: string;
  twin1: string | null;
  twin2: string | null;
  twin1Upright: boolean | null;
  twin2Upright: boolean | null;
  portraitVideo: boolean;
  paid: boolean;
}): string {
  if (!a.paid || !a.twin2) return a.twin1 ?? a.asked;
  if (!a.twin1) return a.twin2;
  if ((a.twin1Upright !== false) === a.portraitVideo) return a.twin1;
  if ((a.twin2Upright !== false) === a.portraitVideo) return a.twin2;
  return a.asked;
}

export function isTwinLook(lookId: string | null | undefined, p: TwinLookFields | null | undefined): boolean {
  return !!lookId && twinLookIds(p).includes(lookId);
}
