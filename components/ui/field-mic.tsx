"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface FieldMicProps {
  onTranscript: (text: string) => void;
  title?: string;
  size?: "sm" | "md" | "lg";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecognition = any;

export function FieldMic({ onTranscript, title = "Speak", size = "sm" }: FieldMicProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<AnyRecognition>(null);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SR) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      onTranscript(e.results[0][0].transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
