"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useSpeechRecognition, COMMAND_SILENCE_MS } from "@/lib/hooks/use-speech-recognition";

interface FieldMicProps {
  onTranscript: (text: string) => void;
  title?: string;
  size?: "sm" | "md" | "lg";
  /**
   * How long a pause ends the turn.
   *
   * Defaults to the short window, because most fields with a mic beside them
   * hold a few words — a city, a state, a title — and waiting three seconds
   * after saying "Harleysville" is its own kind of broken. Pass
   * PROSE_SILENCE_MS on a field where whole sentences get dictated and a pause
   * to think should not end the turn.
   */
  silenceMs?: number;
  /**
   * Live text while speaking, so a caller with room can show what is being
   * heard. Emits "" when the turn ends and the settled text has gone to
   * onTranscript.
   *
   * Reported rather than written into the field: both callers APPEND, and
   * writing interim text into the value and replacing it later would mangle
   * what is already there if a session ends unexpectedly.
   */
  onInterim?: (text: string) => void;
}

/** For fields that take sentences rather than a few words. */
export const PROSE_SILENCE_MS = 3000;

/**
 * Dictation into a single field.
 *
 * This used to run its own recogniser, and it was the crude one: no interim
 * results, `continuous` left at its default of false, and a flat 12-second
 * cutoff. The consequences were all felt rather than seen — it ended at the
 * first pause, so a two-sentence description took two taps; there was nothing
 * on screen while you spoke, so you could not tell it was working; and it cut
 * you off mid-sentence at twelve seconds whether or not you were still
 * talking. It also only ever read `results[0][0]`, so anything after the first
 * phrase would have been dropped even if continuous had been switched on.
 *
 * useSpeechRecognition already solved every one of those for the voice
 * sessions — continuous capture, live interim text, ending on a real pause
 * rather than a stopwatch, and the guard for iOS Safari hanging without firing
 * onend. Two recognisers in one app was always going to mean one of them
 * lagging, and this was the one lagging.
 */
export function FieldMic({
  onTranscript,
  title = "Speak",
  size = "sm",
  silenceMs = COMMAND_SILENCE_MS,
  onInterim,
}: FieldMicProps) {
  // In a ref so the effect below depends on the speech state alone. Callers
  // pass an inline arrow, which is a new function every render.
  const onInterimRef = useRef(onInterim);
  onInterimRef.current = onInterim;

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    silenceMs,
    // Fires once when the turn ends, with everything settled during it — so a
    // pause mid-thought no longer splits one description into two.
    onSessionEnd: (text) => {
      const said = text.trim();
      if (said) onTranscript(said);
      else toast("No speech detected — tap the mic and try again.", { icon: "🎙️" });
    },
    onUnsupported: () =>
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Safari."),
    // Space belongs to whatever field has focus here; this mic sits beside
    // inputs the user is typing into.
    holdSpace: false,
  });

  /**
   * Report the live text upward, in an effect rather than during render.
   *
   * Calling a parent's setter while rendering is a real bug, not a style
   * point: React warns, and updating another component mid-render is exactly
   * the pattern that produces a loop. Settled words plus the uncommitted tail,
   * which together are what the user has said so far, and "" once the turn is
   * over so the caller can hide its preview.
   */
  useEffect(() => {
    if (!onInterimRef.current) return;
    onInterimRef.current(listening ? [transcript, interim].filter(Boolean).join(" ") : "");
  }, [listening, transcript, interim]);

  if (size === "lg") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all ${
          listening
            ? "bg-red-500 text-white"
            : "bg-primary-600 hover:bg-primary-700 text-white"
        }`}
      >
        {listening
          ? <><MicOff size={18} /> Tap to stop</>
          : <><Mic size={18} /> {title}</>}
      </button>
    );
  }

  if (size === "md") {
    return (
      <button
        type="button"
        onClick={toggle}
        title={listening ? "Tap to stop" : title}
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm ${
          listening
            ? "bg-red-500 text-white"
            : "bg-primary-600 hover:bg-primary-700 text-white"
        }`}
      >
        {listening
          ? <Loader2 size={20} className="animate-spin" />
          : <Mic size={20} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      className={`shrink-0 p-1.5 rounded-lg transition-colors ${
        listening
          ? "text-red-500 bg-red-50"
          : "text-slate-400 hover:text-primary-600 hover:bg-primary-50"
      }`}
    >
      {listening
        ? <Loader2 size={14} className="animate-spin text-red-500" />
        : <Mic size={14} />}
    </button>
  );
}
