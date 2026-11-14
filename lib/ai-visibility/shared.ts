/**
 * AI Visibility (2026-11-14, the owner's approved mockup,
 * docs/mockups/ai-visibility-mockup.html): the parts both the browser and the
 * server read. No server imports here.
 */

export type Engine = "chatgpt" | "perplexity";
export const ENGINES: Engine[] = ["chatgpt", "perplexity"];
/** Shown on screen: they are what is being measured (the owner's call). */
export const ENGINE_LABEL: Record<Engine, string> = { chatgpt: "ChatGPT", perplexity: "Perplexity" };

export interface TownQuestion {
  q: string;
  /** The Google search it came from; null when the agent wrote it or no search was found. */
  search: string | null;
}

export type CitedKind = "website" | "halo" | "youtube_channel" | "youtube_video" | "card" | "social";
export const CITED_LABEL: Record<CitedKind, string> = {
  website: "your website",
  halo: "your Halo site",
  youtube_channel: "your YouTube channel",
  youtube_video: "your YouTube video",
  card: "your Video Business Card",
  social: "one of your posts",
};

export interface Cited { kind: CitedKind; url: string }
export interface Source { url: string; domain: string }

/** Towns per plan: Creator 1, Producer 2, Influencer 3 (the owner's call). */
export function townLimit(level: string): number {
  if (level === "producer") return 2;
  if (level === "influencer" || level === "admin") return 3;
  if (level === "creator") return 1;
  return 0;
}

export const QUESTIONS_PER_TOWN = 10;
