import type { createAdminClient } from "@/lib/supabase/admin";
import { openaiChatJson } from "@/lib/api/openai-chat";
import { chatJson } from "@/lib/api/perplexity-chat";
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

const SYSTEM = (h: HomeData, today: string) => `You are Sparklee, the planner inside SparkReels, an AI video and content app for real estate agents.
The agent tells you a goal in their own words. Propose a short, practical plan using ONLY what SparkReels can do.

What SparkReels can make for you to plan:
- "video": a short video draft. Writing it also writes a matching blog article, title, caption and thumbnail. Once the agent makes and approves it, it posts by itself on its day to the accounts you list. One video can go to several accounts (that covers "Facebook + Instagram post", "YouTube", "LinkedIn"); do not list the same video twice for different accounts.
- "tool": a step the agent finishes in a SparkReels tool. Allowed tool ids: ${Object.keys(PLAN_TOOLS).join(", ")}.

This agent, right now (real data, do not invent anything beyond it):
- Plan: ${h.paid ? h.tier : "free"}${h.admin ? " (admin, no limit)" : ""}. Videos left this month: ${h.usage.unlimited ? "no limit" : h.usage.shortLeft}.
- Market: ${[h.city, h.state].filter(Boolean).join(", ") || "not set"}. Time zone ${h.timeZone}. Today is ${today}.
- Connected accounts: ${h.connected.length ? h.connected.map(platformLabel).join(", ") : "none"}.
- CRM: ${h.crm.boldtrail ? "BoldTrail connected (seller updates can email sellers once approved)" : "none connected"}.
- Waiting on their approval already: ${h.approvals.length}.

Rules:
- At most 4 items, and no more videos than they have left (unless no limit). Prefer 1-2 videos.
- Only list accounts that are connected. If the goal needs one that isn't, still plan it and name the account in "needs".
- Never promise views, leads or results. Never contact anyone; seller and review steps are tools the agent finishes.
- Plain, short words. Titles under 70 characters.
- If one vital detail is missing (for example the listing address for "market my listing"), ask it in "question" and return no items.

Return ONLY JSON:
{"reply":"one short sentence","question":"","items":[{"type":"video","title":"","topic":"the full topic for the writer, naming the town","day":"friday","size":"vertical|horizontal","platforms":["facebook","instagram"],"note":"short detail"},{"type":"tool","tool":"seller_update","title":"","note":""}],"needs":["linkedin"]}`;

export async function planFor(admin: Admin, userId: string, words: string): Promise<Plan> {
  const h = await loadHome(admin, userId);
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: h.timeZone });
  const system = SYSTEM(h, today);
  const turn = [{ role: "user" as const, content: words.slice(0, 1500) }];
  const raw = (await openaiChatJson(system, turn, { label: "sparklee-plan", maxTokens: 1600, timeoutMs: 45_000 }))
    ?? (await chatJson(system, turn, { label: "sparklee-plan", maxTokens: 900 }));
  if (!raw) throw new Error("Sparklee couldn't plan that just now. Try again.");

  const connected = new Set(h.connected);
  const needs = new Set<string>();
  for (const n of Array.isArray(raw.needs) ? raw.needs : []) if (typeof n === "string" && HALO_PLATFORMS.includes(n) && !connected.has(n)) needs.add(n);

  const items: PlanItem[] = [];
  for (const r of (Array.isArray(raw.items) ? raw.items : []) as Record<string, unknown>[]) {
    if (items.length >= 4) break;
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
    reply: String(raw.reply ?? "Here's what I recommend.").slice(0, 240),
    question: typeof raw.question === "string" && raw.question.trim() && items.length === 0 ? raw.question.trim().slice(0, 200) : undefined,
    items, videos, usageLine, overBudget, paid: h.paid,
    missing: Array.from(needs).map((p) => ({ label: `Connect ${platformLabel(p)} to post there`, href: "/settings/social" })),
  };
}
