import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Spotting attempts to get the AI to give away how SparkReels works
 * (2026-11-12, the owner's ask). Typed or spoken text that asks for the
 * instructions, the prompt or how the app is built is recorded in
 * security_events, and the weekly watch email lists it.
 *
 * Kept narrow on purpose: "rules" alone is everywhere in real estate (HOA
 * rules), so only phrasings aimed at the AI itself count.
 */
const PROBES: RegExp[] = [
  /\bsystem\s*(prompt|message|instructions?)\b/i,
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,30}\b(previous|prior|above|earlier|all|your|these|the)\b[^.?!]{0,20}\b(instructions?|prompts?|rules|directions)\b/i,
  /\b(reveal|show|print|repeat|output|display|share|tell me|give me|what (are|is|were))\b[^.?!]{0,25}\b(your|the|its)\s+(system\s+)?(instructions?|prompts?|guidelines|initial message|hidden rules)\b/i,
  /\b(developer|god|dan|jailbreak)\s*mode\b|\bjailbreak\b/i,
  /\brepeat\b[^.?!]{0,20}\b(text|words|everything)\b[^.?!]{0,10}\babove\b/i,
  /\b(what|which)\s+(ai|model|llm|api|gpt|engine)s?\b[^.?!]{0,30}\b(are you|do you use|does (this|it|sparkreels|sparklee) use|powers?)\b/i,
  /\bhow\s+(is|was|did you|do you)\b[^.?!]{0,25}\b(this app|sparkreels|sparklee|this tool|this site)\b[^.?!]{0,20}\b(built|made|coded|programmed|work behind)\b/i,
  /\b(source code|your code|the code behind|api keys?|prompt engineering)\b/i,
];

/** The part of the text that matched, or null. */
export function findProbe(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  for (const re of PROBES) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/** A short, one-way fingerprint of the caller's address (never the address). */
export function ipHashOf(req: NextRequest | Request | null | undefined): string | null {
  const ip = (req?.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  return ip ? createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
}

/**
 * Records the text if it looks like a probe. Never throws and never slows the
 * request it came from: callers don't await it.
 */
export function noteProbe(opts: {
  text: string | null | undefined;
  source: string;
  userId?: string | null;
  req?: NextRequest | Request | null;
}): void {
  const hit = findProbe(opts.text);
  if (!hit) return;
  const detail = String(opts.text).replace(/\s+/g, " ").trim().slice(0, 500);
  // waitUntil: the row is still written after the reply has gone out.
  waitUntil((async () => {
    try {
      await createAdminClient().from("security_events").insert({
        user_id: opts.userId ?? null,
        kind: "prompt_probe",
        source: opts.source.slice(0, 60),
        detail,
        matched: hit.slice(0, 120),
        ip_hash: ipHashOf(opts.req),
      });
    } catch (e) {
      console.error("[security] couldn't record a probe:", e instanceof Error ? e.message : e);
    }
  })());
}
