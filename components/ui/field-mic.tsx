"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

interface FieldMicProps {
  onTranscript: (text: string) => void;
  title?: string;
  size?: "sm" | "lg";
}

export function FieldMic({ onTranscript, title = "Speak", size = "sm" }: FieldMicProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = (window as typeof window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition
      || (window as typeof window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition;

    if (!SR) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
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
