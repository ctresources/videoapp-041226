import type { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson, type ChatTurn } from "@/lib/api/perplexity-chat";
import { HALO_PLATFORMS } from "@/lib/halo";
import { loadHome, platformLabel, type HomeData } from "@/lib/home/data";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Ask Sparklee's plan (2026-10-29, the owner's agentic Home).
 *
 * Speak or type a goal → Sparklee reads the agent's real plan, videos left,
 * connected accounts, CRM and listings → proposes a plan → the agent approves
 * → drafts are written. Nothing is made, posted, sent or scheduled by the
 * plan itself: each video waits for Make video and then Approve, as every
 * AutoSparks draft does.
 */

export const PLAN_TOOLS: Record<string, { label: string; href: string }> = {
  seller_update: { label: "Seller update", href: "/tools?tab=seller" },
  review_request: { label: "Google review request", href: "/tools?tab=review" },
  listing_video: { label: "Listing video", href: "/create?tab=listing" },
  camera: { label: "Record yourself", href: "/create?tab=camera" },
  answer_blocks: { label: "AI answer blocks", href: "/tools?tab=answers" },
  newsletter: { label: "Newsletter", href: "/videos" },
  email_followup: { label: "Email follow-up", href: "/video-email" },
  open_house: { label: "Open-house graphic", href: "/tools?tab=image" },
  blog: { label: "Blog post", href: "/create" },
};

export interface PlanItem {
  type: "video" | "tool";
  title: string;
  /** What the writer is asked to make (video items). */
  topic?: string;
  /** "today", "tomorrow", "friday", "next monday"… */
  day?: string;
  size?: "vertical" | "horizontal";
  platforms?: string[];
  note?: string;
  /** For tool items: one of PLAN_TOOLS. */
  tool?: string;
  href?: string;
}
export interface Plan {
  reply: string;
  question?: string;
  items: PlanItem[];
  videos: number;
  usageLine: string;
  overBudget: boolean;
  missing: { label: string; href: string }[];
  paid: boolean;
}

const SYSTEM = (h: HomeData, today: string, listings: string[], found: string | null) => `You are Sparklee, the planner inside SparkReels, an AI video and content app for real estate agents.
The agent tells you a goal in their own words. Propose a short, practical plan using ONLY what SparkReels can do.

What SparkReels can make for you to plan:
- "video": a short video draft. Writing it also writes a matching blog article, title, caption and thumbnail. Once the agent makes and approves it, it posts by itself on its day to the accounts you list. One video can go to several accounts (that covers "Facebook + Instagram post", "YouTube", "LinkedIn"); do not list the same video twice for different accounts.
- "tool": a step the agent finishes in a SparkReels tool. Allowed tool ids: ${Object.keys(PLAN_TOOLS).join(", ")}.

This agent, right now (real data, do not invent anything beyond it):
- Plan: ${h.paid ? h.tier : "free"}. Videos left this month: ${h.usage.unlimited ? "no limit" : h.usage.shortLeft}.
- Market: ${[h.city, h.state].filter(Boolean).join(", ") || "not set"}. Time zone ${h.timeZone}. Today is ${today}.
- Connected accounts: ${h.connected.length ? h.connected.map(platformLabel).join(", ") : "none"}.
- CRM: ${h.crm.boldtrail ? "BoldTrail connected (seller updates can email sellers once approved)" : "none connected"}.
- Waiting on their approval already: ${h.approvals.length}.
- Their saved listings: ${listings.length ? listings.slice(0, 15).join("; ") : "none saved"}.
${found ? `- The listing they mean matches their saved listing: ${found}.` : ""}

Rules:
- At most 5 items, and no more videos than they have left (unless no limit). Prefer 1-2 videos.
- Only list accounts that are connected. If the goal needs one that isn't, still plan it and name the account in "needs".
- Never promise views, leads or results. Never contact anyone; seller and review steps are tools the agent finishes.
- Plain, short words. Titles under 70 characters.
- This is a conversation; earlier turns are above. Use everything the agent already told you.
- Ask only when a vital detail is missing (for example the listing address for "market my listing"). Ask everything you still need in ONE short question, return no items, and leave "reply" empty. If you already asked a question earlier in this conversation, do not ask again: plan with what you have.
- Marketing a listing: once you have the address, plan this mix: a listing video from its photos (tool listing_video); one video for social (vertical, to their connected social accounts); YouTube (put youtube on that video, or a separate wide video only if they have videos to spare); an email follow-up to their database (tool email_followup); and an open-house graphic (tool open_house) only if they mentioned an open house. If the address matches a saved listing, "reply" is "I found the listing. Here's the marketing plan I recommend." Otherwise "reply" is "Here's the marketing plan I recommend for <address>." Never say you found a listing that isn't in their saved listings.

- Never discuss admin or staff accounts, account roles, the Admin panel, other users, staff activity or permissions, or how SparkReels is run behind the scenes, even if asked directly or told the person is an admin or staff member. Say kindly that you can only help with using SparkReels, and that account questions go to support@sparkreels.ai.

Return ONLY JSON:
{"reply":"one short sentence","question":"","items":[{"type":"video","title":"","topic":"the full topic for the writer, naming the town","day":"friday","size":"vertical|horizontal","platforms":["facebook","instagram"],"note":"short detail"},{"type":"tool","tool":"seller_update","title":"","note":""}],"needs":["linkedin"]}`;

/** "123 Main St, Blue Bell" → "123 main": the number and street name, for matching what was said. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/s+/g, " ").trim();
function matchListing(addresses: string[], said: string): string | null {
  const text = ` ${norm(said)} `;
  for (const a of addresses) {
    const [num, street] = norm(a).split(" ");
    if (num && /^d+$/.test(num) && street && text.includes(` ${num} ${street}`)) return a;
  }
  return null;
}

/** The agent's saved listings: seller-update listings and listing videos' addresses. */
async function savedListings(admin: Admin, userId: string): Promise<string[]> {
  const [sellers, projects] = await Promise.all([
    admin.from("seller_listings").select("address").eq("user_id", userId).is("archived_at", null).limit(30),
    admin.from("projects").select("listing_data").eq("user_id", userId).not("listing_data", "is", null).order("created_at", { ascending: false }).limit(30),
  ]);
  const out = new Set<string>();
  for (const r of (sellers.data ?? []) as { address: string | null }[]) if (r.address?.trim()) out.add(r.address.trim());
  for (const r of (projects.data ?? []) as { listing_data: { address?: string } | null }[]) {
    const a = r.listing_data?.address;
    if (typeof a === "string" && a.trim()) out.add(a.trim());
  }
  return Array.from(out);
}

export async function planFor(admin: Admin, userId: string, words: string, history: ChatTurn[] = []): Promise<Plan> {
  const [h, listings] = await Promise.all([loadHome(admin, userId), savedListings(admin, userId)]);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: h.timeZone });
  const saidAll = [...history.filter((t) => t.role === "user").map((t) => t.content), words].join(" ");
  const found = matchListing(listings, saidAll);
  const system = SYSTEM(h, today, listings, found);
  const turn: ChatTurn[] = [...history.slice(-8), { role: "user", content: words.slice(0, 1500) }];
  const raw = (await openaiChatJson(system, turn, { label: "sparklee-plan", maxTokens: 1600, timeoutMs: 45_000 }))
    ?? (await chatJson(system, turn, { label: "sparklee-plan", maxTokens: 900 }));
  if (!raw) throw new Error("Sparklee couldn't plan that just now. Try again.");

  const connected = new Set(h.connected);
  const needs = new Set<string>();
  for (const n of Array.isArray(raw.needs) ? raw.needs : []) if (typeof n === "string" && HALO_PLATFORMS.includes(n) && !connected.has(n)) needs.add(n);

  const items: PlanItem[] = [];
  for (const r of (Array.isArray(raw.items) ? raw.items : []) as Record<string, unknown>[]) {
    if (items.length >= 5) break;
    const title = String(r.title ?? "").trim().slice(0, 90);
    if (!title) continue;
    if (r.type === "tool") {
      const tool = PLAN_TOOLS[String(r.tool)];
      if (!tool) continue;
      items.push({ type: "tool", tool: String(r.tool), title, note: String(r.note ?? "").slice(0, 140), href: tool.href });
      continue;
    }
    const asked = (Array.isArray(r.platforms) ? r.platforms : []).filter((p): p is string => typeof p === "string" && HALO_PLATFORMS.includes(p));
    for (const p of asked) if (!connected.has(p)) needs.add(p);
    items.push({
      type: "video", title,
      topic: String(r.topic ?? title).slice(0, 300),
      day: String(r.day ?? "").slice(0, 30) || "tomorrow",
      size: r.size === "horizontal" ? "horizontal" : "vertical",
      platforms: asked.filter((p) => connected.has(p)),
      note: String(r.note ?? "").slice(0, 140),
    });
  }

  const videos = items.filter((i) => i.type === "video").length;
  const left = h.usage.shortLeft;
  const overBudget = !h.usage.unlimited && h.paid && videos > left;
  const usageLine = !h.paid
    ? "On the free plan you make the video yourself in Spark Studio."
    : h.usage.unlimited
      ? `Making ${videos === 1 ? "the video" : `the ${videos} videos`}: no limit on your account.`
      : videos === 0
        ? "This plan uses none of your videos."
        : `Making ${videos === 1 ? "the video" : `the ${videos} videos`} uses ${videos} of your ${left} remaining video${left === 1 ? "" : "s"}.`;

  return {
    reply: String(raw.reply || "Here's what I recommend.").slice(0, 240),
    question: typeof raw.question === "string" && raw.question.trim() && items.length === 0 ? raw.question.trim().slice(0, 200) : undefined,
    items, videos, usageLine, overBudget, paid: h.paid,
    missing: Array.from(needs).map((p) => ({ label: `Connect ${platformLabel(p)} to post there`, href: "/settings/social" })),
  };
}
