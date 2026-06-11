"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

interface FieldMicProps {
  onTranscript: (text: string) => void;
  title?: string;
  size?: "sm" | "md" | "lg";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

const TIMEOUT_MS = 12000;

export function FieldMic({ onTranscript, title = "Speak", size = "sm" }: FieldMicProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<AnyRecognition>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotResultRef = useRef(false);

  function stop(showHint = false) {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    gotResultRef.current = false;
    setListening(false);
    if (showHint) toast("No speech detected — tap the mic and try again.", { icon: "🎙️" });
  }

  function toggle() {
    if (listening) { stop(); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SR) {
      toast.error("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    const recognition = new SR() as AnyRecognition;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      gotResultRef.current = true;
      onTranscript(e.results[0][0].transcript);
    };

    recognition.onend = () => {
      const got = gotResultRef.current;
      stop(/* showHint= */ !got);
    };

    recognition.onerror = (e: { error: string }) => {
      const msg =
        e.error === "not-allowed" ? "Microphone access denied. Please allow mic access and try again." :
        e.error === "network"     ? "Network error during speech recognition. Check your connection." :
        e.error === "no-speech"   ? "No speech detected — tap the mic and try again." :
        "Speech recognition failed. Try again.";
      toast.error(msg);
      stop();
    };

    recognitionRef.current = recognition;
    gotResultRef.current = false;
    recognition.start();
    setListening(true);

    // Safety timeout — iOS Safari sometimes hangs without firing onend/onerror
    timeoutRef.current = setTimeout(() => {
      stop(/* showHint= */ !gotResultRef.current);
    }, TIMEOUT_MS);
  }

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
