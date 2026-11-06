import { welcomeLine, type OpenerPlace } from "@/lib/api/agent-opener";
import type { DesignId } from "@/lib/templates/designs";

/**
 * "Open with me" on the video templates (2026-11-03, the owner approved
 * these lines): a short cinematic shot of the agent before the template,
 * speaking one line in their Digital Twin's own voice (silent with a
 * headshot look, which has no voice of theirs linked).
 */
export const OPEN_PLACE: Record<DesignId, OpenerPlace> = {
  just_listed: "home",
  open_house: "home",
  luxury: "elegant",
  market_update: "area",
  neighborhood: "area",
  agent_intro: "office",
};

/** The line for each design, from the words on screen. Null when there's nothing to say it about. */
export function templateLine(design: DesignId, f: Record<string, string>, company?: string | null): string | null {
  const t = (k: string) => (f[k] ?? "").trim();
  switch (design) {
    case "just_listed":
    case "open_house":
    case "luxury":
      return welcomeLine(t("address"));
    case "market_update": {
      const area = t("title").replace(/\s*housing market\s*$/i, "").trim();
      return area ? `Here's what's happening in the ${area} housing market this month.` : null;
    }
    case "neighborhood":
      return t("name") ? `Let me show you around ${t("name")}.` : null;
    case "agent_intro": {
      const name = t("name");
      return name ? `Hi, I'm ${name}${company?.trim() ? ` with ${company.trim()}` : ""}.` : null;
    }
  }
}
