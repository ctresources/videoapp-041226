"use client";

import { useCallback, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Mic } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

export interface EditorSettings {
  videoType: "youtube_16x9" | "reel_9x16" | "youtube_long" | null;
  renderMode: "avatar_voice" | "voice_only" | null;
  musicId: string | null;
  captions: boolean | null;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  /** The script as it stands, so a spoken edit can be applied to it. */
  script: string;
  /** Apply setting changes. Nulls mean "not mentioned" and must not clear anything. */
  onSettings: (settings: EditorSettings) => void;
  /** A rewritten script — only ever called when the agent asked for a change. */
  onScript: (script: string) => void;
  /**
   * Which step this is sitting on. Both scopes accept both kinds of
   * instruction — the model is not told to refuse settings on the Script
   * step — it only decides which example the hint leads with, so the
   * suggestion matches what is actually on screen to watch change.
   */
  scope?: "script" | "setup";
  disabled?: boolean;
}

/**
 * Spoken control of the Video setup rail — "make it a reel, voice only, upbeat
 * music", or "make the opening punchier".
 *
 * Compact on purpose. The editor is already the densest screen in the app, and
 * this sits above controls the user can still reach by hand; it is a second way
 * in, not a replacement. That is also why there is no big mic and no waveform
 * here, unlike the Create page where the mic *is* the screen.
 */
export function EditorVoiceSession({ script, onSettings, onScript, scope = "setup", disabled = false }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [lastReply, setLastReply] = useState("");
  const busyRef = useRef(false);
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const scriptRef = useRef(script);
  scriptRef.current = script;

  const send = useCallback(async (spoken: string) => {
    const said = spoken.trim();
    if (!said || busyRef.current) return;
    busyRef.current = true;

    const next: Turn[] = [...turnsRef.current, { role: "user", content: said }];
    setTurns(next);
    setThinking(true);
    try {
      const res = await fetch("/api/ai/editor-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: next, script: scriptRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503) {
          toast.error("Voice isn't available right now — use the controls below.");
          return;
        }
        throw new Error((data.error as string) || `Failed (${res.status})`);
      }

      onSettings(data.settings as EditorSettings);
      // Only when a rewrite actually came back. A failed rewrite returns null
      // and the script the user already had stays untouched.
      //
      // Whether it searched is said out loud, because "did you use current
      // numbers?" has a different honest answer in each case and the script
      // itself gives no clue which happened.
      if (typeof data.script === "string" && data.script.trim()) {
        onScript(data.script);
        toast.success(
          data.searched === true
            ? "Script updated — looked up current figures."
            : "Script updated using what was already in the script.",
        );
      } else if (data.scriptEdit) {
        toast.error("Couldn't apply that change — the script is unchanged.");
      }
      setLastReply((data.reply as string) || "");
      setTurns((t) => [...t, { role: "assistant", content: (data.reply as string) || "" }]);
      // Deliberately nothing here that starts a render. Voice moves the
      // controls on this rail, all of which can be moved back by hand;
      // spending a video is a click, and only a click.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Didn't catch that — try again.");
    } finally {
      setThinking(false);
      busyRef.current = false;
    }
  }, [onSettings, onScript]);

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    onSessionEnd: send,
    onUnsupported: () => toast.error("Speech isn't supported here — use the controls below."),
    disabled: disabled || thinking,
    // No global Space here: the editor has a script textarea, and the Create
    // page's shortcut exists because that screen is the mic.
    holdSpace: false,
  });

  const live = [transcript, interim].filter(Boolean).join(" ");

  return (
    <div className="mb-4 rounded-xl border border-spark-rule bg-spark-amber-tint/40 p-3">
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          onClick={toggle}
          disabled={disabled || thinking}
          aria-pressed={listening}
          aria-label={listening ? "Stop recording" : "Change it by voice"}
          className={`relative flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            listening ? "bg-spark-amber" : "bg-spark-amber hover:bg-spark-blue"
          }`}
        >
          {listening && (
            <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/30" />
          )}
          <Mic size={16} className="relative text-white" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-spark-ink">
            {thinking
              ? "Thinking…"
              : listening
                ? "Listening — click to stop"
                : scope === "script"
                  ? "Change the script by voice"
                  : "Change it by voice"}
          </p>
          <p className="mt-0.5 text-[12px] leading-[1.45] text-spark-ink-muted">
            {live ||
              lastReply ||
              (scope === "script"
                ? "“Make the opening punchier.” Or “cut the part about taxes.”"
                : "“Make it vertical, voice only, upbeat music.” Or “make the opening punchier.”")}
          </p>
        </div>
      </div>
    </div>
  );
}
