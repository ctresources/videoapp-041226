/**
 * ASS subtitle generation for word-synced captions.
 *
 * Word timestamps come from ElevenLabs (free, built into TTS call).
 * No OpenAI Whisper API needed.
 */

import type { WordTimestamp } from "./elevenlabs";

// Re-export for convenience
export type { WordTimestamp };

export interface CaptionSegment {
  text: string;
  words: WordTimestamp[];
  start: number;
  end: number;
}

/**
 * Group words into display-friendly caption segments (4-6 words each).
 */
export function groupIntoSegments(words: WordTimestamp[], wordsPerSegment = 5): CaptionSegment[] {
  const segments: CaptionSegment[] = [];

  for (let i = 0; i < words.length; i += wordsPerSegment) {
    const chunk = words.slice(i, i + wordsPerSegment);
    segments.push({
      text: chunk.map((w) => w.word).join(" "),
      words: chunk,
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }

  return segments;
}

/**
 * Generate ASS (Advanced SubStation Alpha) subtitle file with karaoke word highlighting.
 *
 * @param words   Word-level timestamps (from ElevenLabs)
 * @param options Styling options
 * @returns       ASS file content as a string
 */
export function generateASS(
  words: WordTimestamp[],
  options: {
    width: number;
    height: number;
    fontSize?: number;
    fontColor?: string;       // hex like "FFFFFF"
    highlightColor?: string;  // hex like "FACC15"
    yPosition?: number;       // pixels from top
  } = { width: 1920, height: 1080 },
): string {
  const fontSize = options.fontSize || 42;
  const primaryBGR = hexToBGR(options.fontColor || "FFFFFF");
  const highlightBGR = hexToBGR(options.highlightColor || "FACC15");

  // Calculate vertical margin from bottom
  const marginV = options.yPosition
    ? options.height - options.yPosition
    : Math.round(options.height * 0.10);

  const header = `[Script Info]
Title: Captions
ScriptType: v4.00+
PlayResX: ${options.width}
PlayResY: ${options.height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Montserrat,${fontSize},&H00${primaryBGR},&H00${highlightBGR},&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,2,0,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const segments = groupIntoSegments(words, 5);
  const events: string[] = [];

  for (const seg of segments) {
    const startTime = formatASSTime(seg.start);
    const endTime = formatASSTime(seg.end);

    // Build karaoke tags: each word gets \kf with duration in centiseconds
    let karaokeText = "";
    for (const w of seg.words) {
      const durCs = Math.round((w.end - w.start) * 100);
      karaokeText += `{\\kf${durCs}}${w.word} `;
    }

    events.push(
      `Dialogue: 0,${startTime},${endTime},Caption,,0,0,0,,${karaokeText.trim()}`
    );
  }

  return header + events.join("\n") + "\n";
}

/** Convert "FACC15" hex to BGR "15CCFA" for ASS format. */
function hexToBGR(hex: string): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `${b}${g}${r}`;
}

/** Format seconds to ASS timestamp: H:MM:SS.CC */
function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
