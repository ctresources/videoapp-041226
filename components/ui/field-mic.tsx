"use client";

import { useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import toast from "react-hot-toast";

interface FieldMicProps {
  onTranscript: (text: string) => void;
  title?: string;
}

export function FieldMic({ onTranscript, title = "Tap to speak" }: FieldMicProps) {
  const [listening, setListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null);

  function start() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Speech recognition requires Chrome or Safari.");
      return;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      onTranscript((e.results[0][0].transcript as string).trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      setListening(false);
      if (e.error === "not-allowed") toast.error("Microphone permission denied.");
      else if (e.error !== "no-speech") toast.error("Could not hear you — try again.");
    };
    recogRef.current = r;
    r.start();
  }

  function stop() {
    recogRef.current?.stop();
  }

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      title={listening ? "Tap to stop" : title}
      className={`p-2 rounded-lg transition-colors shrink-0 ${
        listening
          ? "bg-red-50 text-red-500 animate-pulse"
          : "text-slate-400 hover:text-primary-500 hover:bg-primary-50"
      }`}
    >
      {listening
        ? <Square size={14} fill="currentColor" />
        : <Mic size={15} />}
    </button>
  );
}
