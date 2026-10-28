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
  twin_outfit_look_ids?: string[] | null;
}

export function twinLookIds(p: TwinLookFields | null | undefined): string[] {
  if (!p?.heygen_digital_twin_look_id) return [];
  return [p.heygen_digital_twin_look_id, ...(p.twin_outfit_look_ids ?? [])];
}

export function isTwinLook(lookId: string | null | undefined, p: TwinLookFields | null | undefined): boolean {
  return !!lookId && twinLookIds(p).includes(lookId);
}
