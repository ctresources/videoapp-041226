import { describe, it, expect, vi } from "vitest";

// The planners and the shot maker reach the network; these tests use only the pure helpers.
vi.mock("@/lib/api/perplexity-chat", () => ({ chatJson: vi.fn() }));
vi.mock("@/lib/api/openai-chat", () => ({ openaiChatJson: vi.fn() }));
vi.mock("@/lib/api/agent-opener", () => ({ makeCinematicAvatarClip: vi.fn() }));

import {
  CINEMATIC_MAX_SCENES, MAX_LINE_WORDS, cleanPlace, scenePrompt, secondsForLine, speechEnd, splitSceneLines,
} from "@/lib/video/cinematic-avatar";

const count = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("splitSceneLines", () => {
  it("gives each sentence its own scene", () => {
    const lines = splitSceneLines(
      "Thinking about buying a home this spring? Let's talk about it over coffee. The first thing I tell every buyer: walk the neighborhood before you fall for the house.",
    );
    expect(lines).toEqual([
      "Thinking about buying a home this spring?",
      "Let's talk about it over coffee.",
      "The first thing I tell every buyer: walk the neighborhood before you fall for the house.",
    ]);
  });

  it("joins a very short sentence to its neighbour", () => {
    const lines = splitSceneLines("Hi there. Today I want to walk you through what's happening in our local market this month.");
    expect(lines).toHaveLength(1);
  });

  it("cuts a long sentence so no scene runs past 15 seconds", () => {
    const long = Array.from({ length: 70 }, (_, i) => `word${i}${i % 12 === 11 ? "," : ""}`).join(" ") + ".";
    const lines = splitSceneLines(long);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(count(l)).toBeLessThanOrEqual(MAX_LINE_WORDS);
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe(long);
  });

  it("never makes more than the most scenes a video takes", () => {
    const many = Array.from({ length: 60 }, (_, i) => `This is sentence number ${i} of the script.`).join(" ");
    expect(splitSceneLines(many).length).toBeLessThanOrEqual(CINEMATIC_MAX_SCENES);
  });
});

describe("secondsForLine", () => {
  it("stays within the 5 to 15 seconds a shot can be", () => {
    expect(secondsForLine("Hi.")).toBe(5);
    expect(secondsForLine(Array(32).fill("word").join(" "))).toBeLessThanOrEqual(15);
  });
});

describe("speechEnd", () => {
  const line = "The first thing I tell every buyer: walk the neighborhood before you fall for the house.";
  const said = line.split(/\s+/).map((w, i) => ({ word: w, start: i * 0.4, end: i * 0.4 + 0.35 }));

  it("cuts after the line's last word, before anything the shot added", () => {
    const added = [...said, { word: "Danke", start: 6.6, end: 7 }, { word: "schön", start: 7.1, end: 7.5 }];
    const end = speechEnd(added, line, 9);
    expect(end).toBeGreaterThanOrEqual(said[said.length - 1].end);
    expect(end).toBeLessThan(6.6);
    // With nothing added, a beat after the last word.
    expect(speechEnd(said, line, 9)).toBeCloseTo(said[said.length - 1].end + 0.3, 5);
  });

  it("uses the word at the line's length when the last word was misheard", () => {
    const misheard = said.map((w, i) => (i === said.length - 1 ? { ...w, word: "hours" } : w));
    expect(speechEnd(misheard, line, 9)).toBeCloseTo(misheard[misheard.length - 1].end + 0.3, 5);
  });

  it("falls back to the usual pace with no transcript, within the shot", () => {
    expect(speechEnd([], line, 9)).toBeGreaterThan(5);
    expect(speechEnd([], line, 3)).toBe(3);
  });
});

describe("scenePrompt and cleanPlace", () => {
  it("keeps the line, says to fall silent after it, and never passes quotes through", () => {
    const p = scenePrompt('Say "hello" now.', 'Café "by" the window', 0);
    expect(p).toContain('say: "Say hello now."');
    expect(p).toContain("stop talking");
    expect(p).toContain("Café by the window");
  });

  it("trims a place to one short line", () => {
    expect(cleanPlace("  Bright\nkitchen  ")).toBe("Bright kitchen");
    expect(cleanPlace("x".repeat(100))).toHaveLength(60);
    expect(cleanPlace(42)).toBe("");
  });
});
