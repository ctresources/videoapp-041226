/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Voice-follow ("Flow") teleprompter engine.
 *
 * Uses the browser's built-in SpeechRecognition to listen while the user
 * reads, matches the recognized words against the script, and reports the
 * reader's current word index so the teleprompter can scroll to follow their
 * actual pace — speeding up, slowing down, and pausing with the speaker.
 *
 * Runs entirely in the browser (no API cost). Supported in Chrome/Edge and
 * Android Chrome; Safari support is partial — callers must fall back to
 * constant-speed auto-scroll when isVoiceFollowSupported() is false or
 * onUnavailable fires.
 */

export function isVoiceFollowSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function tokenizeScript(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, "");
}

// Loose word equality — recognizers mangle endings ("markets"/"market"),
// so a shared 4-letter prefix on longer words counts as a match.
function wordsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4)) return true;
  return false;
}

export class VoiceFollower {
  private tokens: string[];
  private idx = 0;
  private rec: any = null;
  private active = false;
  private onIndex: (i: number) => void;
  private onUnavailable?: () => void;
  private onTranscript?: (text: string, isFinal: boolean) => void;

  constructor(
    script: string,
    onIndex: (i: number) => void,
    onUnavailable?: () => void,
    onTranscript?: (text: string, isFinal: boolean) => void,
  ) {
    this.tokens = tokenizeScript(script).map(norm);
    this.onIndex = onIndex;
    this.onUnavailable = onUnavailable;
    this.onTranscript = onTranscript;
  }

  start() {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      this.onUnavailable?.();
      return;
    }
    this.active = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: any) => this.handleResult(e);
    rec.onerror = (e: any) => {
      // Permission/device failures are terminal — hand control back to auto-scroll.
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed" || e?.error === "audio-capture") {
        this.active = false;
        this.onUnavailable?.();
      }
      // "no-speech" and "network" blips recover via onend → restart below.
    };
    // Recognizers stop themselves after silence — keep restarting while active.
    rec.onend = () => {
      if (this.active) {
        try { rec.start(); } catch { /* already starting */ }
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.active = false;
      this.onUnavailable?.();
    }
  }

  /** Stop listening but keep the reader's position for resume(). */
  pause() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* noop */ }
  }

  resume() {
    if (this.active) return;
    this.start();
  }

  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* noop */ }
    this.rec = null;
  }

  private handleResult(e: any) {
    // Feed the newest phrase to the transcript listener (live captions)
    if (this.onTranscript && e.results.length > 0) {
      const latest = e.results[e.results.length - 1];
      const text: string = latest[0]?.transcript || "";
      if (text.trim()) this.onTranscript(text.trim(), !!latest.isFinal);
    }

    let heard: string[] = [];
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t: string = e.results[i][0]?.transcript || "";
      heard = heard.concat(t.trim().split(/\s+/));
    }
    heard = heard.map(norm).filter(Boolean).slice(-8);
    if (heard.length === 0) return;

    const next = this.match(heard);
    if (next > this.idx) {
      this.idx = next;
      this.onIndex(next);
    }
  }

  /**
   * Find where the tail of the recognized speech best aligns in the script,
   * searching a window just behind and well ahead of the current position.
   * Position only ever advances — a stray match never yanks the prompter
   * backwards.
   */
  private match(heard: string[]): number {
    const start = Math.max(0, this.idx - 3);
    const end = Math.min(this.tokens.length - 1, this.idx + 40);
    let best = this.idx;
    let bestScore = 0;

    for (let p = start; p <= end; p++) {
      let score = 0;
      for (let k = 0; k < heard.length && k <= p; k++) {
        if (wordsMatch(this.tokens[p - k], heard[heard.length - 1 - k])) score++;
      }
      if (score > bestScore || (score === bestScore && score > 0 && Math.abs(p - this.idx) < Math.abs(best - this.idx))) {
        bestScore = score;
        best = p;
      }
    }

    // Require at least 2 aligned words before moving — filters random noise.
    return bestScore >= 2 ? best : this.idx;
  }
}

/**
 * Bare live transcriber — same recognition engine as VoiceFollower but with
 * no script matching. Used for burned-in live captions when the teleprompter
 * is in constant-speed (Auto) mode, so only one recognizer ever runs.
 */
export class LiveTranscriber {
  private rec: any = null;
  private active = false;
  private onText: (text: string, isFinal: boolean) => void;
  private onUnavailable?: () => void;

  constructor(onText: (text: string, isFinal: boolean) => void, onUnavailable?: () => void) {
    this.onText = onText;
    this.onUnavailable = onUnavailable;
  }

  start() {
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      this.onUnavailable?.();
      return;
    }
    this.active = true;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e: any) => {
      if (e.results.length === 0) return;
      const latest = e.results[e.results.length - 1];
      const text: string = latest[0]?.transcript || "";
      if (text.trim()) this.onText(text.trim(), !!latest.isFinal);
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed" || e?.error === "audio-capture") {
        this.active = false;
        this.onUnavailable?.();
      }
    };
    rec.onend = () => {
      if (this.active) {
        try { rec.start(); } catch { /* already starting */ }
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.active = false;
      this.onUnavailable?.();
    }
  }

  pause() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* noop */ }
  }

  resume() {
    if (this.active) return;
    this.start();
  }

  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* noop */ }
    this.rec = null;
  }
}

/**
 * Scrolls the teleprompter container so the given word index sits at the
 * reading line (~30% from the top) and highlights it. Word elements must
 * carry data-w="<index>" attributes. Inline styles are used for the
 * highlight so Tailwind's purge can't strip them.
 */
export function followWordInContainer(container: HTMLElement | null, idx: number) {
  if (!container) return;
  const el = container.querySelector<HTMLElement>(`[data-w="${idx}"]`);
  if (!el) return;

  const cRect = container.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const target = eRect.top - cRect.top + container.scrollTop - container.clientHeight * 0.3;
  container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });

  const prev = (container as any).__flowEl as HTMLElement | undefined;
  if (prev) {
    prev.style.background = "";
    prev.style.borderRadius = "";
  }
  el.style.background = "rgba(251, 191, 36, 0.4)";
  el.style.borderRadius = "4px";
  (container as any).__flowEl = el;
}
