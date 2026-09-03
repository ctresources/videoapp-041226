"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

/**
 * iOS Safari sometimes hangs without ever firing onend or onerror, so every
 * session gets a hard stop. Long enough to dictate a whole sentence.
 */
const TIMEOUT_MS = 30000;

/**
 * How long a pause means "I'm done".
 *
 * There was no answer to this before: with `continuous = true` the recogniser
 * is told NOT to stop on its own, so the end of a turn was whatever Chrome
 * happened to decide — usually seconds later, sometimes not until the 30s cap,
 * and different again on Safari. Long enough to think mid-sentence, short
 * enough that falling silent feels like it ended your turn.
 */
const SILENCE_MS = 3000;

/**
 * Shorter, for a spoken COMMAND rather than spoken prose.
 *
 * Three seconds is right when you are composing a sentence and may pause to
 * think. "Make the opening punchier" is over in a second and a half, and then
 * you sit watching nothing happen for twice as long as it took to say — which
 * is most of what makes the editor's voice rewrites feel slow. Nothing about
 * the round-trip changed; the wait before it starts did.
 */
export const COMMAND_SILENCE_MS = 1500;

export interface UseSpeechRecognitionOptions {
  /**
   * Fired once when a listening session ends, with everything settled during
   * it. Empty string means nothing was captured.
   *
   * This is the "got it" beat. It cannot be replaced by watching the live
   * transcript, which fills word by word while the user is still talking.
   */
  onSessionEnd?: (finalText: string) => void;
  /** Fired when the browser has no speech recognition at all. */
  onUnsupported?: () => void;
  disabled?: boolean;
  /** Hold Space anywhere on the page to talk. */
  holdSpace?: boolean;
  /**
   * How long a pause ends the turn. Defaults to SILENCE_MS, which suits
   * dictating prose; pass COMMAND_SILENCE_MS where the user is giving a short
   * instruction and the wait is the thing they notice.
   */
  silenceMs?: number;
}

/**
 * Browser speech recognition, shared by the one-shot topic mic and the voice
 * brief session.
 *
 * Extracted from voice-topic-hero rather than copied into the session: the
 * recogniser has enough sharp edges — the iOS hang, `aborted` not being a real
 * error, Space having to be ignored while a field has focus — that maintaining
 * two of them would guarantee they drift.
 */
export function useSpeechRecognition({
  onSessionEnd,
  onUnsupported,
  disabled = false,
  holdSpace = false,
  silenceMs = SILENCE_MS,
}: UseSpeechRecognitionOptions) {
  const [listening, setListening] = useState(false);
  /** Words the recogniser has not committed yet — shown greyed. */
  const [interim, setInterim] = useState("");
  /** Everything settled so far in the current session. */
  const [transcript, setTranscript] = useState("");

  const recognitionRef = useRef<AnyRecognition>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Restarted on every result, so it only ever fires after a real pause. Armed
  // by the first words rather than by the session opening — otherwise the
  // three seconds run out while you are still deciding what to say.
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef("");
  // The recogniser's uncommitted tail, kept in a ref so onend can read it
  // without waiting for a render.
  const pendingRef = useRef("");
  // Whether this session has already handed its words over. A session can end
  // by the mic being pressed, by silence, or by the browser stopping on its
  // own, and more than one of those can fire for a single session.
  const endedRef = useRef(false);
  // Handlers live in refs so start/stop can stay dependency-free and still call
  // the current ones rather than those from the render that opened the session.
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;
  // In a ref for the same reason the handlers are: the onresult closure is
  // created once when the session opens, and reading the prop directly there
  // would pin the value from that render.
  const silenceMsRef = useRef(silenceMs);
  silenceMsRef.current = silenceMs;

  /** `deliver: false` tears the session down without handing its words over —
   *  used on unmount, where there is no longer anyone to hand them to. */
  const stop = useCallback((deliver = true) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
    // Clear the ref BEFORE stopping. Some implementations fire `onend`
    // synchronously from inside stop(), and onend calls back into here — with
    // the ref still set that re-enters and fires onSessionEnd once per level.
    const active = recognitionRef.current;
    recognitionRef.current = null;
    try {
      active?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
    setInterim("");

    // Deliver here rather than in onend.
    //
    // onend guards on the ref still pointing at its own session, which is what
    // stops a re-entrant stop() firing the handler once per level. But pressing
    // the mic to stop clears that ref first, so by the time onend ran the guard
    // was already false and the turn was dropped on the floor: nothing sent, no
    // slots, no reply. Only falling silent and letting the timeout end the
    // session ever reached the handler.
    //
    // endedRef makes it exactly once per session however the session ends.
    if (!deliver || !active || endedRef.current) return;
    endedRef.current = true;
    const captured = [settledRef.current, pendingRef.current].filter(Boolean).join(" ").trim();
    if (!captured) toast("No speech detected — tap the mic and try again.", { icon: "🎙️" });
    onSessionEndRef.current?.(captured);
  }, []);

  const start = useCallback(() => {
    if (disabled || recognitionRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      onUnsupportedRef.current?.();
      return;
    }

    const recognition = new SR() as AnyRecognition;
    recognition.lang = "en-US";
    // Interim results are what let the words appear as they are spoken;
    // continuous is what lets a whole sentence land in one session.
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    settledRef.current = "";
    pendingRef.current = "";
    endedRef.current = false;
    setTranscript("");

    recognition.onresult = (e: {
      results: { length: number; [k: number]: { isFinal: boolean; [k: number]: { transcript: string } } };
    }) => {
      let settled = "";
      let pending = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) settled += result[0].transcript;
        else pending += result[0].transcript;
      }
      settledRef.current = settled.trim();
      pendingRef.current = pending.trim();
      setTranscript(settledRef.current);
      setInterim(pendingRef.current);

      // Every word pushes the end of the turn further out; stopping pushing
      // ends it. Interim results count, so this tracks the voice rather than
      // the recogniser's slower decisions about what it heard.
      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => stop(), silenceMsRef.current);
    };

    // The session ending on its own — silence, or the browser giving up.
    // stop() does the delivering for every path, so this only has to route
    // into it; its endedRef guard makes a second onend harmless.
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      stop();
    };

    recognition.onerror = (e: { error: string }) => {
      // `aborted` is what fires when we stop the session ourselves.
      if (e.error === "aborted") return;
      const msg =
        e.error === "not-allowed" ? "Microphone access denied. Please allow mic access and try again." :
        e.error === "network"     ? "Network error during speech recognition. Check your connection." :
        e.error === "no-speech"   ? "No speech detected — tap the mic and try again." :
        "Speech recognition failed. Try again.";
      toast.error(msg);
      stop();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    timeoutRef.current = setTimeout(() => stop(), TIMEOUT_MS);
  }, [disabled, stop]);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  // Hold Space to talk. Only a shortcut when the user isn't typing into
  // something, or it swallows every space in the sentence they're writing.
  useEffect(() => {
    if (!holdSpace) return;
    function isTypingTarget(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target) || disabled) return;
      e.preventDefault();
      start();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== "Space" || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (recognitionRef.current) stop();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [holdSpace, start, stop, disabled]);

  // Never leave a recogniser running behind an unmounted component
  useEffect(() => () => stop(/* deliver= */ false), [stop]);

  return { listening, interim, transcript, start, stop, toggle };
}
