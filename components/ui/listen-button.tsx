"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Square, Volume2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * 🔊 Listen: a script or article read aloud (2026-10-21, the owner's ask).
 *
 * In the agent's own cloned voice (/api/ai/listen, saved so replays are
 * free); with no clone, in the browser's own voice. Pause, resume, stop.
 */

/** Article markup and stage notes out, so only the words are read. */
export function speakableText(text: string): string {
  return text
    .replace(/^\s*H[1-6]:\s*/gim, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type State = "idle" | "loading" | "playing" | "paused";

export function ListenButton({ text, label = "Listen", className = "" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<State>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const browserRef = useRef(false);

  // Stop on leaving the page.
  useEffect(() => () => {
    audioRef.current?.pause();
    if (browserRef.current) window.speechSynthesis?.cancel();
  }, []);

  function stop() {
    audioRef.current?.pause();
    audioRef.current = null;
    if (browserRef.current) window.speechSynthesis?.cancel();
    browserRef.current = false;
    setState("idle");
  }

  function readInBrowser(words: string) {
    if (!("speechSynthesis" in window)) { toast.error("This browser can't read aloud."); setState("idle"); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(words);
    u.rate = 1;
    u.onend = () => { browserRef.current = false; setState("idle"); };
    u.onerror = () => { browserRef.current = false; setState("idle"); };
    browserRef.current = true;
    window.speechSynthesis.speak(u);
    setState("playing");
  }

  async function start() {
    const words = speakableText(text);
    if (!words) { toast.error("Nothing to read yet."); return; }
    setState("loading");
    try {
      const res = await fetch("/api/ai/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: words }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't read it aloud.");
      if (body.fallback || !body.url) { readInBrowser(words); return; }
      const audio = new Audio(body.url);
      audioRef.current = audio;
      audio.onended = () => { audioRef.current = null; setState("idle"); };
      await audio.play();
      setState("playing");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read it aloud.");
      setState("idle");
    }
  }

  function togglePause() {
    if (browserRef.current) {
      if (state === "playing") { window.speechSynthesis.pause(); setState("paused"); }
      else { window.speechSynthesis.resume(); setState("playing"); }
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (state === "playing") { a.pause(); setState("paused"); }
    else { void a.play(); setState("playing"); }
  }

  const btn = "flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink transition-colors hover:border-spark-amber hover:text-spark-amber disabled:opacity-60";
  if (state === "idle") {
    return <button type="button" onClick={() => void start()} className={`${btn} ${className}`}><Volume2 size={13} /> {label}</button>;
  }
  if (state === "loading") {
    return <button type="button" disabled className={`${btn} ${className}`}><Loader2 size={13} className="animate-spin" /> Getting it ready…</button>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button type="button" onClick={togglePause} className={btn}>
        {state === "playing" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
      </button>
      <button type="button" onClick={stop} className={btn} aria-label="Stop"><Square size={12} /> Stop</button>
    </span>
  );
}
