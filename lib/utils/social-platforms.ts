/**
 * The platforms a video can be published to besides YouTube, and the rules
 * each one imposes.
 *
 * YouTube is not here: it is connected natively through our own OAuth and
 * never passes through the publishing partner. Everything in this file is
 * pure, so the settings page, the Publish window and the post route all read
 * one definition of what a platform is, what it needs and what fits on it.
 */

export type PartnerPlatform =
  | "instagram" | "facebook" | "linkedin" | "tiktok" | "x" | "threads" | "google_business";

export interface PartnerPlatformSpec {
  id: PartnerPlatform;
  label: string;
  /** Longest video the platform takes through the API, in seconds. */
  maxVideoSeconds: number;
  /** What the agent's account has to be, in one plain sentence, shown before they connect. */
  needs: string;
}

export const PARTNER_PLATFORMS: readonly PartnerPlatformSpec[] = [
  { id: "instagram", label: "Instagram", maxVideoSeconds: 900,
    needs: "A Business or Creator account linked to a Facebook Page. A personal Instagram account can't be posted to." },
  { id: "facebook", label: "Facebook", maxVideoSeconds: 14400,
    needs: "A Facebook Page. Personal profiles can't be posted to." },
  { id: "linkedin", label: "LinkedIn", maxVideoSeconds: 1800,
    needs: "Your personal profile or a company page." },
  { id: "tiktok", label: "TikTok", maxVideoSeconds: 600,
    needs: "Any TikTok account. Most accounts take videos up to 3 minutes." },
  { id: "x", label: "X", maxVideoSeconds: 1200,
    needs: "Any X account." },
  { id: "threads", label: "Threads", maxVideoSeconds: 300,
    needs: "Any Threads account. Videos up to 5 minutes." },
  { id: "google_business", label: "Google Business", maxVideoSeconds: 30,
    needs: "A verified Google Business Profile. Videos over 30 seconds go up as a photo post with a Learn more button." },
];

export function partnerPlatform(id: string): PartnerPlatformSpec | undefined {
  return PARTNER_PLATFORMS.find((p) => p.id === id);
}

/** The id the Publish window and the post route use for one of these accounts. */
export const partnerAccountId = (p: PartnerPlatform) => `social_${p}`;

export function platformFromAccountId(accountId: string): PartnerPlatform | null {
  const id = accountId.startsWith("social_") ? accountId.slice("social_".length) : "";
  return partnerPlatform(id)?.id ?? null;
}

/**
 * How many of these platforms one video may be posted to, by plan.
 *
 * The publishing partner charges per connected customer, not per platform, so
 * this is packaging rather than cost: Creator posts to YouTube plus three
 * more, and "every platform" is one of the reasons to move up. A plan with no
 * entry gets none, which keeps unpaid accounts from holding a paid slot.
 * Infinity for unlimited, so callers can compare without a special case.
 */
export function partnerPlatformLimit(tier: string | null | undefined, role?: string | null): number {
  if (role === "admin") return Infinity;
  if (tier === "agent" || tier === "pro") return Infinity;
  if (tier === "starter") return 3;
  return 0;
}

export type Delivery =
  | { kind: "video" }
  /** A still image with the caption and a button, for a video the platform won't take. */
  | { kind: "photo" }
  | { kind: "skip"; reason: string };

/**
 * What to send a platform for a video of this length.
 *
 * The length is often unknown (most rows have no duration recorded), and an
 * unknown length is sent as a video and left to the platform to accept or
 * refuse, with one exception. Google Business rejects anything over 30
 * seconds, so there a video goes only when it is KNOWN to fit, and everything
 * else becomes a photo post: a refusal there would be the common case, not
 * the rare one.
 */
export function deliveryFor(platform: PartnerPlatform, durationSeconds: number | null | undefined): Delivery {
  const spec = partnerPlatform(platform)!;
  const known = typeof durationSeconds === "number" && durationSeconds > 0;

  if (platform === "google_business") {
    return known && durationSeconds! <= spec.maxVideoSeconds ? { kind: "video" } : { kind: "photo" };
  }
  if (known && durationSeconds! > spec.maxVideoSeconds) {
    const mins = Math.floor(spec.maxVideoSeconds / 60);
    return { kind: "skip", reason: `This video is longer than ${spec.label} allows (${mins} minutes).` };
  }
  return { kind: "video" };
}

/** Cut to a platform's text limit at a word, never mid-word. */
export function fitCaption(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Drops any sentence that carries a phone number.
 *
 * Google Business rejects posts with a phone number in the text, and the
 * agent's sign-off usually has one. The whole sentence goes rather than just
 * the digits, because "Call me at ." is worse than saying nothing; the post's
 * Learn more button is the ask there instead.
 */
export function withoutPhoneNumbers(text: string): string {
  const phone = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
  return text
    .split(/\n/)
    .map((line) => line.split(/(?<=[.!?])\s+/).filter((sentence) => !phone.test(sentence)).join(" "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
