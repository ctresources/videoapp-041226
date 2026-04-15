/**
 * VoiceToVideos.AI — Demo Video Renderer  (v2)
 * 75-second walkthrough using Creatomate rect + text + audio (ElevenLabs)
 * Run: node scripts/render-demo-video.mjs
 */

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");
let envVars = {};
try {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k) envVars[k] = v;
  }
} catch { /**/ }

const API_KEY = envVars.CREATOMATE_API_KEY || process.env.CREATOMATE_API_KEY;
if (!API_KEY) { console.error("❌  CREATOMATE_API_KEY not found"); process.exit(1); }

// ─── Brand palette ─────────────────────────────────────────────────────────
const P = "#6366F1";   // primary indigo
const S = "#8B5CF6";   // secondary purple
const A = "#14B8A6";   // accent teal
const W = "#FFFFFF";
const BG = "#0F172A";  // slate-900
const CARD = "#1E293B";
const DIM = "#94A3B8";
const DARK2 = "#020617";

// ─── Element helpers ───────────────────────────────────────────────────────
const r = (o) => ({ type: "rectangle", ...o });
const t = (o) => ({ type: "text", font_family: "Inter", ...o });

function fade(delay = 0, dur = 0.5) {
  return [{ time: delay, duration: dur, easing: "quadratic-out", type: "fade", fade: 0 }];
}
function slideUp(delay = 0, dist = 30, dur = 0.6) {
  return [{ time: delay, duration: dur, easing: "quadratic-out", type: "slide", direction: "up", distance: dist, fade: 0 }];
}
function slideLeft(delay = 0, dist = 50, dur = 0.6) {
  return [{ time: delay, duration: dur, easing: "quadratic-out", type: "slide", direction: "left", distance: dist, fade: 0 }];
}
function slideRight(delay = 0, dist = 50, dur = 0.6) {
  return [{ time: delay, duration: dur, easing: "quadratic-out", type: "slide", direction: "right", distance: dist, fade: 0 }];
}

// Gradient background
function bg(c1 = DARK2, c2 = "#1E1B4B") {
  return r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%", width: "100%", height: "100%",
    fill_color: [{ position: 0, color: c1 }, { position: 100, color: c2 }],
    fill_mode: "linear", fill_rotation: 135 });
}

// Card panel
function card(x, y, w, h, extra = {}) {
  return r({ x, y, x_anchor: "50%", y_anchor: "50%", width: w, height: h,
    fill_color: CARD, border_radius: 16, border_width: 1,
    border_color: "rgba(255,255,255,0.08)", ...extra });
}

// Label pill
function pill(label, x, y, color = P, delay = 0) {
  return {
    type: "composition",
    x, y, x_anchor: "50%", y_anchor: "50%",
    animations: fade(delay),
    elements: [
      r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
        width: "100%", height: "100%", fill_color: `${color}25`,
        border_radius: 100, border_width: 1, border_color: `${color}60` }),
      t({ text: label, font_size: 18, font_weight: "700", fill_color: color,
        x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
        x_padding: 22, y_padding: 9 }),
    ],
  };
}

// Caption bar at bottom
function caption(text_content, delay = 1.5) {
  return {
    type: "composition",
    x: "50%", y: "88%", x_anchor: "50%", y_anchor: "50%",
    width: "78%",
    animations: fade(delay, 0.4),
    elements: [
      r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
        width: "100%", height: "100%", fill_color: "rgba(0,0,0,0.7)",
        border_radius: 12 }),
      t({ text: text_content, font_size: 26, font_weight: "600", fill_color: W,
        x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
        text_wrap: true, width: "92%", x_alignment: "50%",
        x_padding: 0, y_padding: 14 }),
    ],
  };
}

// Scene wrapper — fades in/out
function scene(startTime, dur, elements) {
  return {
    type: "composition",
    time: startTime, duration: dur,
    x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
    width: "100%", height: "100%",
    animations: [
      { time: 0,        duration: 0.4, easing: "quadratic-out", type: "fade", fade: 0 },
      { time: `end-0.4s`, duration: 0.4, easing: "quadratic-in",  type: "fade", fade: 0 },
    ],
    elements,
  };
}

// Check row item
function check(label, x, y, delay = 0, color = A) {
  return {
    type: "composition",
    x, y, x_anchor: "0%", y_anchor: "50%",
    animations: slideRight(delay, 30, 0.5),
    elements: [
      r({ x: 0, y: "50%", x_anchor: "0%", y_anchor: "50%",
        width: 28, height: 28, fill_color: `${color}25`, border_radius: 6 }),
      t({ text: "✓", font_size: 18, font_weight: "800", fill_color: color,
        x: 14, y: "50%", x_anchor: "50%", y_anchor: "50%" }),
      t({ text: label, font_size: 20, fill_color: "#CBD5E1",
        x: 38, y: "50%", x_anchor: "0%", y_anchor: "50%" }),
    ],
  };
}

// Platform chip
function chip(emoji, name, x, y, color, delay = 0) {
  return {
    type: "composition",
    x, y, x_anchor: "50%", y_anchor: "50%",
    animations: fade(delay),
    elements: [
      r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
        width: 130, height: 44, fill_color: `${color}18`,
        border_radius: 10, border_width: 1, border_color: `${color}50` }),
      t({ text: `${emoji} ${name}`, font_size: 16, font_weight: "600",
        fill_color: color, x: "50%", y: "50%",
        x_anchor: "50%", y_anchor: "50%" }),
    ],
  };
}

// ─── Narration script ───────────────────────────────────────────────────────
const NARRATION = `Real estate agents lose listings every day — not because of bad service, but because competitors show up online consistently and they don't.

VoiceToVideos dot AI changes that.

Start by recording your voice for 90 seconds. Or choose from 10 done-for-you real estate content templates — homebuyer tips, market updates, luxury sellers, relocation guides, and more. Our AI instantly writes a Fair Housing-compliant script and produces a broadcast-quality video narrated in your cloned voice.

Our Trending Topics feature searches what buyers in your market are actually Googling this week — and turns any trend into a video with one click.

Then auto-schedule and publish to YouTube, Instagram, TikTok, LinkedIn, Facebook, and 6 more platforms — all from one content calendar.

Track what's working with built-in analytics. See which videos drive leads, which platforms deliver the best reach, and what content resonates most with your audience.

VoiceToVideos dot AI. Speak. Stream. Share. Start free today.`;

// ─── Build all scenes ───────────────────────────────────────────────────────

const allScenes = [

  // S1 — The Problem (0–11s)
  scene(0, 11, [
    bg(DARK2, "#1E1B4B"),
    r({ x: "50%", y: "9%", x_anchor: "50%", y_anchor: "50%",
      width: 70, height: 4, fill_color: "#EF4444", border_radius: 2 }),

    t({ text: "Real estate agents lose listings every day", font_size: 54, font_weight: "800",
      fill_color: W, x: "50%", y: "33%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "82%", x_alignment: "50%",
      animations: slideUp(0.2, 35) }),
    t({ text: "not because of bad service…", font_size: 38, font_weight: "400",
      fill_color: DIM, x: "50%", y: "46%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "70%", x_alignment: "50%",
      animations: slideUp(0.7, 30) }),
    t({ text: "because competitors show up online and they don't.", font_size: 42, font_weight: "700",
      fill_color: "#FCA5A5", x: "50%", y: "59%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "75%", x_alignment: "50%",
      animations: slideUp(1.3, 30) }),

    // 3 pain stats
    ...[
      ["⏱", "15 hrs/week", "on content"],
      ["📉", "1–2 posts", "per week average"],
      ["👻", "Invisible", "in their ZIP code"],
    ].map(([icon, stat, sub], i) => ({
      type: "composition",
      x: `${17 + i * 33}%`, y: "79%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(2 + i * 0.15),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 340, height: 80, fill_color: "rgba(239,68,68,0.1)",
          border_radius: 12, border_width: 1, border_color: "rgba(239,68,68,0.3)" }),
        t({ text: `${icon}  ${stat}`, font_size: 22, font_weight: "700",
          fill_color: "#FCA5A5", x: "50%", y: "38%",
          x_anchor: "50%", y_anchor: "50%" }),
        t({ text: sub, font_size: 17, fill_color: "#F87171",
          x: "50%", y: "68%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    })),
  ]),

  // S2 — Product intro (11–19s)
  scene(11, 8, [
    bg(BG, "#1E1B4B"),

    // Hero card mock
    r({ x: "50%", y: "46%", x_anchor: "50%", y_anchor: "50%",
      width: 1200, height: 500, fill_color: "#1a1a3e",
      border_radius: 24, border_width: 1, border_color: "rgba(99,102,241,0.4)" }),

    // Logo text
    t({ text: "VoiceToVideos.AI", font_size: 72, font_weight: "900",
      fill_color: W, x: "50%", y: "30%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(0.3, 0.7) }),

    // Tagline gradient text (simulated)
    t({ text: "Stop Losing Listings to Agents Who Post More.", font_size: 36,
      font_weight: "700", fill_color: "#A5B4FC",
      x: "50%", y: "44%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "75%", x_alignment: "50%",
      animations: slideUp(0.6, 25) }),

    // CTA button mock
    {
      type: "composition",
      x: "50%", y: "57%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(1.0, 0.6),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 380, height: 60, fill_color: P, border_radius: 30 }),
        t({ text: "▶  Start Creating Free", font_size: 22, font_weight: "800",
          fill_color: W, x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    },

    // 4 stat badges
    ...[
      ["15 hrs", "saved/week"], ["10x", "content output"],
      ["10", "platforms"],      ["16", "languages"],
    ].map(([stat, sub], i) => ({
      type: "composition",
      x: `${12.5 + i * 25}%`, y: "76%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(1.2 + i * 0.1),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 250, height: 80, fill_color: "rgba(255,255,255,0.05)",
          border_radius: 14, border_width: 1, border_color: "rgba(255,255,255,0.1)" }),
        t({ text: stat, font_size: 32, font_weight: "900", fill_color: W,
          x: "50%", y: "38%", x_anchor: "50%", y_anchor: "50%" }),
        t({ text: sub, font_size: 16, fill_color: DIM,
          x: "50%", y: "70%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    })),
  ]),

  // S3 — Create page (19–29s)
  scene(19, 10, [
    bg(BG, "#0C0A1E"),
    pill("STEP 1  ·  CREATE", "50%", "9%", P, 0),

    t({ text: "Three ways to start creating", font_size: 50, font_weight: "800",
      fill_color: W, x: "50%", y: "19%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(0.2, 30) }),

    // 3 mode cards
    ...[
      { icon: "🎤", label: "Record Voice",     sub: "Speak for 90 seconds\nabout any RE topic",         color: P, x: "17%", delay: 0.4 },
      { icon: "📁", label: "Upload Audio",     sub: "Drop any MP3 or WAV\nfrom your phone",             color: S, x: "50%", delay: 0.6 },
      { icon: "📍", label: "Location Script",  sub: "Market updates · Community\nevents · Why live here", color: A, x: "83%", delay: 0.8 },
    ].map(({ icon, label, sub, color, x, delay }) => ({
      type: "composition",
      x, y: "51%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(delay, 40, 0.6),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 420, height: 270, fill_color: CARD, border_radius: 18,
          border_width: 2, border_color: color }),
        t({ text: icon, font_size: 54, x: "50%", y: "28%",
          x_anchor: "50%", y_anchor: "50%" }),
        t({ text: label, font_size: 28, font_weight: "700", fill_color: W,
          x: "50%", y: "52%", x_anchor: "50%", y_anchor: "50%" }),
        t({ text: sub, font_size: 18, fill_color: DIM,
          x: "50%", y: "72%", x_anchor: "50%", y_anchor: "50%",
          text_wrap: true, width: "85%", x_alignment: "50%" }),
      ],
    })),

    // Template callout
    {
      type: "composition",
      x: "50%", y: "87%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(1.3, 0.5),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 860, height: 54, fill_color: "rgba(99,102,241,0.14)",
          border_radius: 27, border_width: 1, border_color: "rgba(99,102,241,0.4)" }),
        t({ text: "💡  10 done-for-you templates: Homebuyer Tips · Luxury Sellers · VA Loans · Relocation & more",
          font_size: 19, fill_color: "#A5B4FC",
          x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    },
  ]),

  // S4 — AI Generation (29–40s)
  scene(29, 11, [
    bg(BG, "#0C0A1E"),
    pill("STEP 2  ·  AI CREATES EVERYTHING", "50%", "8%", S, 0),

    t({ text: "One recording → complete content package", font_size: 48, font_weight: "800",
      fill_color: W, x: "50%", y: "17%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "80%", x_alignment: "50%",
      animations: slideUp(0.2, 30) }),

    // Left panel — checklist
    {
      type: "composition",
      x: "27%", y: "55%", x_anchor: "50%", y_anchor: "50%",
      animations: slideLeft(0.4, 60, 0.6),
      elements: [
        card("50%", "50%", 580, 460),
        t({ text: "AI Builds All Of This:", font_size: 24, font_weight: "700",
          fill_color: "#CBD5E1", x: "50%", y: "10%",
          x_anchor: "50%", y_anchor: "50%" }),
        check("Fair Housing-compliant script",   "7%", "23%", 0.5),
        check("Voiceover in your cloned voice",  "7%", "35%", 0.65),
        check("Karaoke-style word captions",     "7%", "47%", 0.8),
        check("AI b-roll visuals from Blotato",  "7%", "59%", 0.95),
        check("SEO blog post + meta description","7%", "71%", 1.1),
        check("Hashtags + social captions",      "7%", "83%", 1.25),
      ],
    },

    // Right panel — progress
    {
      type: "composition",
      x: "74%", y: "55%", x_anchor: "50%", y_anchor: "50%",
      animations: slideRight(0.5, 60, 0.6),
      elements: [
        card("50%", "50%", 520, 460),
        t({ text: "⚡ Generating video…", font_size: 22, font_weight: "700",
          fill_color: P, x: "50%", y: "11%",
          x_anchor: "50%", y_anchor: "50%" }),

        // Progress bars
        ...[
          ["Script",   "100%", A,  "26%"],
          ["Video",     "76%", P,  "40%"],
          ["Blog",     "100%", A,  "54%"],
          ["SEO Data", "100%", A,  "68%"],
        ].flatMap(([label, pct, color, y]) => [
          t({ text: label, font_size: 19, fill_color: DIM,
            x: "7%", y, y_anchor: "50%", x_anchor: "0%" }),
          r({ x: "35%", y, x_anchor: "0%", y_anchor: "50%",
            width: 280, height: 10, fill_color: "rgba(255,255,255,0.08)", border_radius: 5 }),
          r({ x: "35%", y, x_anchor: "0%", y_anchor: "50%",
            width: pct, height: 10, fill_color: color, border_radius: 5,
            animations: [{ time: 0.9, duration: 1.4, easing: "quadratic-out",
              type: "wipe", direction: "right" }] }),
          t({ text: pct, font_size: 17, font_weight: "700", fill_color: W,
            x: "93%", y, x_anchor: "100%", y_anchor: "50%" }),
        ]),

        t({ text: "✓  Ready in under 3 minutes", font_size: 21, font_weight: "700",
          fill_color: A, x: "50%", y: "88%",
          x_anchor: "50%", y_anchor: "50%",
          animations: fade(3.5, 0.5) }),
      ],
    },
  ]),

  // S5 — Trending Topics (40–50s)
  scene(40, 10, [
    bg(BG, "#0C1A1A"),
    pill("🔥  TRENDING TOPICS", "50%", "8%", "#EF4444", 0),

    t({ text: "Always know what to post", font_size: 52, font_weight: "800",
      fill_color: W, x: "50%", y: "17%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(0.2, 30) }),
    t({ text: "Perplexity Sonar finds what buyers in your market are searching for right now",
      font_size: 24, fill_color: DIM, x: "50%", y: "25%",
      x_anchor: "50%", y_anchor: "50%", text_wrap: true, width: "65%", x_alignment: "50%",
      animations: fade(0.5) }),

    // 5 trending cards
    ...[
      { rank: "1", icon: "📈", title: "Austin TX Median Home Price Drop",         tag: "Market Update",   tc: P },
      { rank: "2", icon: "🏠", title: "First-Time Buyer Programs Texas 2025",     tag: "Homebuyer Tips",  tc: A },
      { rank: "3", icon: "🎖", title: "VA Loan Benefits: What Changed in 2025",   tag: "VA Loans",        tc: "#F59E0B" },
      { rank: "4", icon: "💎", title: "Luxury Condos vs Single Family ROI",       tag: "Luxury Sellers",  tc: S },
      { rank: "5", icon: "🚚", title: "Why Families Are Moving to Pflugerville",  tag: "Relocation",      tc: "#EC4899" },
    ].map(({ rank, icon, title, tag, tc }, i) => ({
      type: "composition",
      x: "50%", y: `${35 + i * 12}%`, x_anchor: "50%", y_anchor: "50%",
      width: "82%",
      animations: slideRight(0.5 + i * 0.15, 45, 0.5),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: "100%", height: 76, fill_color: CARD,
          border_radius: 12, border_width: 1, border_color: "rgba(255,255,255,0.06)" }),
        // Rank
        r({ x: "1.5%", y: "50%", x_anchor: "0%", y_anchor: "50%",
          width: 34, height: 34, fill_color: `${P}20`, border_radius: 8 }),
        t({ text: rank, font_size: 17, font_weight: "800", fill_color: P,
          x: "3.3%", y: "50%", x_anchor: "50%", y_anchor: "50%" }),
        t({ text: icon, font_size: 26, x: "7.5%", y: "50%",
          x_anchor: "50%", y_anchor: "50%" }),
        // Tag
        r({ x: "11%", y: "30%", x_anchor: "0%", y_anchor: "50%",
          width: 170, height: 26, fill_color: `${tc}20`, border_radius: 100 }),
        t({ text: tag, font_size: 14, font_weight: "700", fill_color: tc,
          x: "19.5%", y: "30%", x_anchor: "50%", y_anchor: "50%" }),
        t({ text: title, font_size: 22, font_weight: "600", fill_color: W,
          x: "11%", y: "68%", x_anchor: "0%", y_anchor: "50%" }),
        t({ text: "→ Create Video", font_size: 17, font_weight: "700",
          fill_color: P, x: "97%", y: "50%", x_anchor: "100%", y_anchor: "50%" }),
      ],
    })),
  ]),

  // S6 — Calendar + 10 platforms (50–62s)
  scene(50, 12, [
    bg(BG, "#0A1628"),
    pill("STEP 3  ·  PUBLISH", "50%", "7%", A, 0),

    t({ text: "Auto-schedule to 10 platforms at once", font_size: 50, font_weight: "800",
      fill_color: W, x: "50%", y: "16%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(0.2, 30) }),

    // Calendar panel (left)
    {
      type: "composition",
      x: "26%", y: "56%", x_anchor: "50%", y_anchor: "50%",
      animations: slideLeft(0.4, 60, 0.6),
      elements: [
        card("50%", "50%", 580, 460),
        t({ text: "📅  Content Calendar — April 2025", font_size: 19, font_weight: "700",
          fill_color: "#CBD5E1", x: "50%", y: "9%",
          x_anchor: "50%", y_anchor: "50%" }),

        // Weekday headers
        ...["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) =>
          t({ text: d, font_size: 13, font_weight: "600", fill_color: "#475569",
            x: `${7 + i * 14.3}%`, y: "19%",
            x_anchor: "50%", y_anchor: "50%" })
        ),
        // Day grid
        ...([
          ["1",  "7%",  "30%", null],
          ["2",  "21%", "30%", { c: "#EF4444", p: "YT" }],
          ["3",  "35%", "30%", { c: "#EC4899", p: "IG" }],
          ["4",  "49%", "30%", null],
          ["5",  "63%", "30%", { c: "#64748B", p: "TT" }],
          ["6",  "77%", "30%", { c: "#3B82F6", p: "LI" }],
          ["7",  "91%", "30%", null],
          ["8",  "7%",  "46%", { c: "#EF4444", p: "YT" }],
          ["9",  "21%", "46%", { c: "#EC4899", p: "IG" }],
          ["10", "35%", "46%", null],
          ["11", "49%", "46%", { c: "#64748B", p: "TT" }],
          ["12", "63%", "46%", { c: A, p: "FB" }],
          ["13", "77%", "46%", { c: "#3B82F6", p: "LI" }],
          ["14", "91%", "46%", { c: P, p: "YT" }],
        ].flatMap(([d, x, y, post]) => [
          t({ text: d, font_size: 15, font_weight: "600",
            fill_color: d === "12" ? W : "#475569",
            x, y, x_anchor: "50%", y_anchor: "50%" }),
          ...(post ? [
            r({ x, y: `${parseFloat(y) + 6.5}%`, x_anchor: "50%", y_anchor: "0%",
              width: 48, height: 20, fill_color: `${post.c}35`,
              border_radius: 5, border_width: 1, border_color: post.c }),
            t({ text: post.p, font_size: 10, font_weight: "800", fill_color: post.c,
              x, y: `${parseFloat(y) + 9.5}%`,
              x_anchor: "50%", y_anchor: "0%" }),
          ] : []),
        ])),
      ],
    },

    // Platform grid (right)
    {
      type: "composition",
      x: "74%", y: "56%", x_anchor: "50%", y_anchor: "50%",
      animations: slideRight(0.5, 60, 0.6),
      elements: [
        card("50%", "50%", 500, 460),
        t({ text: "One click → all platforms", font_size: 21, font_weight: "700",
          fill_color: W, x: "50%", y: "10%",
          x_anchor: "50%", y_anchor: "50%" }),
        chip("▶", "YouTube",   "25%", "25%", "#EF4444", 0.7),
        chip("📷", "Instagram", "75%", "25%", "#EC4899", 0.8),
        chip("🎵", "TikTok",    "25%", "38%", "#94A3B8", 0.9),
        chip("💼", "LinkedIn",  "75%", "38%", "#60A5FA", 1.0),
        chip("🐦", "Twitter",   "25%", "51%", "#38BDF8", 1.1),
        chip("📘", "Facebook",  "75%", "51%", "#93C5FD", 1.2),
        chip("🧵", "Threads",   "25%", "64%", "#CBD5E1", 1.3),
        chip("🦋", "Bluesky",   "75%", "64%", "#7DD3FC", 1.4),
        chip("📌", "Pinterest", "25%", "77%", "#FDA4AF", 1.5),
        chip("🔍", "Google",    "75%", "77%", "#FCD34D", 1.6),
      ],
    },
  ]),

  // S7 — Analytics (62–70s)
  scene(62, 8, [
    bg(BG, "#111827"),
    pill("📊  ANALYTICS", "50%", "8%", S, 0),

    t({ text: "Track exactly what drives leads", font_size: 52, font_weight: "800",
      fill_color: W, x: "50%", y: "18%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(0.2, 30) }),

    // 4 stat cards
    ...[
      { stat: "47",   label: "Videos Created",    icon: "🎬", color: P },
      { stat: "312",  label: "Posts Published",    icon: "📤", color: A },
      { stat: "8",    label: "Platforms Active",   icon: "🌐", color: S },
      { stat: "3.2K", label: "Est. Reach / Month", icon: "👁", color: "#F59E0B" },
    ].map(({ stat, label, icon, color }, i) => ({
      type: "composition",
      x: `${12.5 + i * 25}%`, y: "42%", x_anchor: "50%", y_anchor: "50%",
      animations: slideUp(0.3 + i * 0.12, 25, 0.55),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 295, height: 140,
          fill_color: CARD, border_radius: 16,
          border_width: 1, border_color: `${color}30` }),
        t({ text: icon, font_size: 28, x: "50%", y: "23%",
          x_anchor: "50%", y_anchor: "50%" }),
        t({ text: stat, font_size: 40, font_weight: "900", fill_color: W,
          x: "50%", y: "56%", x_anchor: "50%", y_anchor: "50%" }),
        t({ text: label, font_size: 17, fill_color: DIM,
          x: "50%", y: "80%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    })),

    // Platform bar chart
    {
      type: "composition",
      x: "50%", y: "76%", x_anchor: "50%", y_anchor: "50%",
      width: "80%",
      animations: fade(0.9),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: "100%", height: 140, fill_color: CARD, border_radius: 14,
          border_width: 1, border_color: "rgba(255,255,255,0.06)" }),
        t({ text: "Posts by Platform", font_size: 17, font_weight: "600",
          fill_color: "#64748B", x: "3%", y: "20%",
          x_anchor: "0%", y_anchor: "50%" }),
        ...[
          ["YouTube",   "#EF4444", 74, "12%"],
          ["Instagram", "#EC4899", 95, "26%"],
          ["TikTok",    "#94A3B8", 68, "40%"],
          ["LinkedIn",  "#60A5FA", 52, "54%"],
          ["Facebook",  "#93C5FD", 41, "68%"],
        ].flatMap(([label, color, pct, x]) => [
          t({ text: label, font_size: 14, fill_color: "#64748B",
            x: "3%", y: x, x_anchor: "0%", y_anchor: "50%" }),
          r({ x: "17%", y: x, x_anchor: "0%", y_anchor: "50%",
            width: "78%", height: 10, fill_color: "rgba(255,255,255,0.06)", border_radius: 5 }),
          r({ x: "17%", y: x, x_anchor: "0%", y_anchor: "50%",
            width: `${pct * 0.78}%`, height: 10, fill_color: color, border_radius: 5,
            animations: [{ time: 1.2, duration: 1.2, easing: "quadratic-out",
              type: "wipe", direction: "right" }] }),
        ]),
      ],
    },
  ]),

  // S8 — CTA Outro (70–75s)
  scene(70, 5, [
    r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
      width: "100%", height: "100%",
      fill_color: [{ position: 0, color: "#4F46E5" }, { position: 100, color: "#7C3AED" }],
      fill_mode: "linear", fill_rotation: 135 }),

    // Radial glow
    r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
      width: 1000, height: 1000,
      fill_color: [
        { position: 0, color: "rgba(255,255,255,0.14)" },
        { position: 100, color: "rgba(255,255,255,0)" },
      ],
      fill_mode: "radial", border_radius: "50%" }),

    t({ text: "Become the most visible agent\nin your ZIP code.", font_size: 60,
      font_weight: "900", fill_color: W,
      x: "50%", y: "32%", x_anchor: "50%", y_anchor: "50%",
      text_wrap: true, width: "80%", x_alignment: "50%",
      animations: fade(0.2, 0.6) }),

    t({ text: "VoiceToVideos.AI", font_size: 46, font_weight: "800",
      fill_color: "rgba(255,255,255,0.92)",
      x: "50%", y: "54%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(0.5, 0.5) }),

    t({ text: "Speak  ·  Stream  ·  Share", font_size: 26, font_weight: "400",
      fill_color: "rgba(255,255,255,0.65)",
      x: "50%", y: "64%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(0.7, 0.5) }),

    // CTA button
    {
      type: "composition",
      x: "50%", y: "78%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(1.0, 0.5),
      elements: [
        r({ x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%",
          width: 440, height: 64, fill_color: W, border_radius: 32 }),
        t({ text: "▶  Start Free — 5 Videos on Us", font_size: 22,
          font_weight: "800", fill_color: P,
          x: "50%", y: "50%", x_anchor: "50%", y_anchor: "50%" }),
      ],
    },

    t({ text: "No credit card  ·  Fair Housing compliant  ·  Cancel anytime",
      font_size: 17, fill_color: "rgba(255,255,255,0.45)",
      x: "50%", y: "91%", x_anchor: "50%", y_anchor: "50%",
      animations: fade(1.3, 0.4) }),
  ]),
];

// ─── Creatomate render payload ─────────────────────────────────────────────
const source = {
  output_format: "mp4",
  width: 1920,
  height: 1080,
  duration: 75,
  frame_rate: 30,
  elements: [
    // ElevenLabs narration — full voiceover track
    {
      type: "audio",
      provider: "elevenlabs",
      text: NARRATION,
      model: "eleven_multilingual_v2",
      stability: 0.5,
      similarity_boost: 0.8,
      time: 0,
    },
    ...allScenes,
  ],
};

// ─── Submit ────────────────────────────────────────────────────────────────
console.log(`🎬  Submitting render — ${allScenes.length} scenes, ${source.duration}s, 1920×1080`);

const res = await fetch("https://api.creatomate.com/v1/renders", {
  method: "POST",
  headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ source }),
});

if (!res.ok) {
  const err = await res.text();
  console.error("❌  Creatomate error:", err);
  process.exit(1);
}

const data = await res.json();
const render = Array.isArray(data) ? data[0] : data;
console.log(`✅  Submitted! Render ID: ${render.id}  Status: ${render.status}`);
console.log(`\n⏳  Polling every 8s (renders typically take 3–6 min)…\n`);

for (let i = 0; i < 75; i++) {
  await new Promise(r => setTimeout(r, 8000));
  const p = await fetch(`https://api.creatomate.com/v1/renders/${render.id}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } });
  const d = await p.json();
  const pct = d.status === "rendering" && d.progress != null ? ` (${Math.round(d.progress * 100)}%)` : "";
  process.stdout.write(`\r   Status: ${d.status}${pct}   elapsed: ${(i + 1) * 8}s   `);

  if (d.status === "succeeded") {
    console.log(`\n\n🎉  DONE!\n\n🎥  VIDEO URL:\n    ${d.url}\n`);
    console.log(`📋  Add to your landing page:\n    <video src="${d.url}" autoPlay muted loop playsInline className="..." />`);
    process.exit(0);
  }
  if (d.status === "failed") {
    console.error(`\n\n❌  Render failed: ${d.error_message}`);
    process.exit(1);
  }
}
console.log(`\n\n⚠️  Still rendering after 10 min. Check: https://app.creatomate.com  ID: ${render.id}`);
