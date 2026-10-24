import guide from "./guide.generated.json";

/**
 * What Ask Sparklee knows: the How It Works guide, as plain text.
 *
 * guide.generated.json is written from the How It Works page itself before
 * every build (scripts/build-guide.mjs), so the guide and Sparklee can never
 * say different things. The whole guide is sent each time; it is about 8,000
 * tokens, which costs well under a cent, and an answer is often in a step
 * other than the page's own. The page's own steps are named so they come
 * first to mind.
 */

interface GuideStep { n: number; title: string; text: string }
interface GuidePart { title: string; text: string }
const STEPS = (guide as { steps: GuideStep[] }).steps;
const PARTS = (guide as { parts: GuidePart[] }).parts;

/** Each screen, by its address, and the guide steps about it. */
const PAGES: { name: string; match: (p: string) => boolean; steps: number[] }[] = [
  { name: "Spark Studio (Create)", match: (p) => p === "/create", steps: [12, 13, 15, 17, 18, 19, 25] },
  { name: "the video editor (script, setup, Share Kit)", match: (p) => p.startsWith("/create/"), steps: [14, 15, 20, 21, 22] },
  { name: "AutoSparks", match: (p) => p.startsWith("/autosparks") || p.startsWith("/autopilot"), steps: [16] },
  { name: "My Sparks", match: (p) => p.startsWith("/videos"), steps: [20, 21, 22, 26] },
  { name: "Social Accounts settings", match: (p) => p.startsWith("/settings/social") || p.startsWith("/social"), steps: [10, 21, 22] },
  { name: "Billing (in Settings)", match: (p) => p.startsWith("/billing") || p.startsWith("/settings/billing"), steps: [11] },
  { name: "Settings", match: (p) => p.startsWith("/settings"), steps: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { name: "Spark Tools", match: (p) => p.startsWith("/tools"), steps: [23, 24, 25] },
  { name: "Spark Insights", match: (p) => p.startsWith("/analytics") || p.startsWith("/dashboard"), steps: [26, 27] },
  { name: "Spark Calendar", match: (p) => p.startsWith("/calendar") || p.startsWith("/campaigns"), steps: [28, 26] },
  { name: "How It Works", match: (p) => p.startsWith("/help"), steps: [] },
  { name: "the welcome setup", match: (p) => p.startsWith("/onboarding"), steps: [1, 2, 3] },
];

export function pageFor(path: string): { name: string; steps: number[] } {
  const clean = (path || "/").split("?")[0];
  return PAGES.find((p) => p.match(clean)) ?? { name: "SparkReels", steps: [] };
}

function stepText(s: GuideStep): string {
  return `Step ${s.n}: ${s.title}\n${s.text}`;
}

/** Sparklee's instructions for one conversation. */
export function sparkleeInstructions(path: string, firstName: string | null): string {
  const page = pageFor(path);
  const own = STEPS.filter((s) => page.steps.includes(s.n));
  const rest = STEPS.filter((s) => !page.steps.includes(s.n));
  const partText = PARTS.filter((p) => p.text).map((p) => `${p.title}\n${p.text}`).join("\n\n");

  return [
    `You are Sparklee, the friendly helper inside SparkReels, an app real estate agents use to turn what they say into videos, blogs and social posts. You are talking out loud with ${firstName || "an agent"}, who has the ${page.name} page open right now.`,
    "",
    "How to answer:",
    "- Answer only from the guide below. If it does not cover the question, say you're not sure and suggest opening How It Works from the menu. Never guess.",
    "- Keep it to two or three short spoken sentences. Plain, warm and direct. No lists, no markdown, no symbols read aloud.",
    "- Call buttons, cards and boxes exactly what the guide calls them, so they can find them on screen.",
    "- You cannot see, click or change anything on their screen. Tell them what to press. Never say you did something for them.",
    "- Do not quote prices or plan details beyond what the guide says, do not promise features that are not in it, and never name the companies or services behind SparkReels.",
    "- If they ask about anything other than using SparkReels, say kindly that you can only help with SparkReels.",
    "- If they need a person, tell them to email support at sparkreels dot ai.",
    "- Speak English unless they speak to you in another language; then answer in theirs.",
    "- Start by answering. No greeting speech and no recap of the question.",
    "",
    own.length ? `THE STEPS ABOUT THE PAGE THEY ARE ON (${page.name}):\n\n${own.map(stepText).join("\n\n")}` : "",
    "",
    `THE REST OF THE GUIDE:\n\n${rest.map(stepText).join("\n\n")}`,
    "",
    partText ? `TABLES AND SUMMARIES FROM THE GUIDE:\n\n${partText}` : "",
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}
