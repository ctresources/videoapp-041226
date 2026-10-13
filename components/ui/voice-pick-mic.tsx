"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Loader2, Mic } from "lucide-react";
import { useSpeechRecognition, COMMAND_SILENCE_MS } from "@/lib/hooks/use-speech-recognition";
import type { PickField, PickValue } from "@/lib/api/voice-pick";

export type { PickField, PickValue };

/**
 * The page's mic: say what you want picked, and the controls on the page move.
 *
 * One per page, beside its heading, at the owner's direction. The page hands
 * it the choices that are on screen; it hands back which of them a sentence
 * picked. It shows nothing of its own, because the controls changing is the
 * read-back. A short message names what was set, since some of it may be
 * below the fold.
 *
 * It only picks. Making a video or sending a post is still a press.
 */
export function VoicePickMic({ fields, onPicks, disabled = false, label = "Choose by voice", className = "" }: {
  /** The choices on this page right now. Read when the sentence ends. */
  fields: PickField[];
  onPicks: (picks: Record<string, PickValue>) => void;
  disabled?: boolean;
  /** For a screen reader and the hover text. */
  label?: string;
  className?: string;
}) {
  const [thinking, setThinking] = useState(false);
  const busy = useRef(false);
  // The recogniser's callback outlives the render that made it.
  const fieldsRef = useRef(fields); fieldsRef.current = fields;
  const onPicksRef = useRef(onPicks); onPicksRef.current = onPicks;

  const send = useCallback(async (spoken: string) => {
    const said = spoken.trim();
    if (!said || busy.current) return;
    const offered = fieldsRef.current;
    if (offered.length === 0) return;
    busy.current = true;
    setThinking(true);
    try {
      const res = await fetch("/api/ai/voice-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said, fields: offered }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Didn't catch that. Try again.");

      const picks = (data.picks ?? {}) as Record<string, PickValue>;
      const keys = Object.keys(picks);
      if (keys.length === 0) {
        toast(data.reply || "I didn't hear a choice in that. Try again.", { duration: 5000 });
        return;
      }
      onPicksRef.current(picks);
      // Named the way the page names them, so it reads as the page changing.
      const set = keys.map((k) => {
        const f = offered.find((x) => x.key === k);
        const v = picks[k];
        if (!f) return null;
        if (f.type === "choice") return f.options?.find((o) => o.value === v)?.label ?? String(v);
        if (f.type === "toggle") return `${f.label} ${v ? "on" : "off"}`;
        return `${f.label}: ${v}`;
      }).filter(Boolean);
      toast.success(`Set: ${set.join(", ")}`, { duration: 5000 });
      if (data.reply) toast(String(data.reply), { duration: 5000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Didn't catch that. Try again.");
    } finally {
      setThinking(false);
      busy.current = false;
    }
  }, []);

  const { listening, toggle } = useSpeechRecognition({
    onSessionEnd: send,
    onUnsupported: () => toast.error("Speech isn't supported in this browser. Use the controls instead."),
    disabled: disabled || thinking,
    // No global Space: these pages have text boxes.
    holdSpace: false,
    // A command, not a composition: over in a second or two.
    silenceMs: COMMAND_SILENCE_MS,
  });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || thinking}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : label}
      title={listening ? "Listening. Click to stop" : label}
      className={`relative flex h-9 w-9 flex-none items-center justify-center rounded-full bg-spark-amber transition-colors hover:bg-spark-blue disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {listening && <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/30" />}
      {thinking
        ? <Loader2 size={16} className="relative animate-spin text-white" />
        : <Mic size={16} className="relative text-white" />}
    </button>
  );
}

/** Where a page puts the mic of a form it holds: beside its own heading. */
export const PAGE_MIC_SLOT = "page-mic-slot";

/**
 * The same mic, drawn beside a heading the form does not own.
 *
 * The reel forms sit inside a card whose heading belongs to the Create page,
 * and the mic goes beside the heading, but only the form knows its choices.
 * So the page leaves an empty place by the heading and the form's mic is
 * drawn into it. With no such place on the page, it sits at the top of the
 * form instead.
 */
export function VoicePickMicInSlot(props: Parameters<typeof VoicePickMic>[0]) {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined);
  useEffect(() => { setSlot(document.getElementById(PAGE_MIC_SLOT)); }, []);
  if (slot === undefined) return null;
  const mic = <VoicePickMic {...props} />;
  return slot ? createPortal(mic, slot) : <div className="flex justify-end">{mic}</div>;
}
