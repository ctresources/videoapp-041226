"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mic, Square } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

/**
 * The front door, on a phone especially: one mic, one sentence.
 *
 * Voice already ran the Create page, but only once you had answered two rows
 * of tiles and reached the third section. This puts the same thing first: say
 * "create a blog about…" or "make a short video with my avatar about…", and
 * the sentence is handed to the Create page's voice brief to carry out.
 *
 * It only listens and passes the words on. Understanding them, and deciding
 * whether the command is complete, is the brief's job, so there is one place
 * that knows what a command means, however it arrives.
 *
 * Two homes:
 * - "card", on the Dashboard: a card of its own that sends you to the Create
 *   page with the sentence (`?say=`).
 * - "hero", at the top of the Create page, which is where signing in lands.
 *   It hands the sentence straight to the page (`onCommand`) and shows the
 *   brief's answer under the mic, because the panel that answer lives in is
 *   two sections further down the screen.
 *
 * Nothing said here can spend a video: a blog is written outright, and a
 * video stops at its script and setup screen, where rendering is its own
 * deliberate step.
 */
export function SpeakToSpark({ variant = "card", onCommand, busy = false, reply = "" }: {
  variant?: "card" | "hero";
  /** Given on the Create page: carry the sentence out here instead of navigating. */
  onCommand?: (text: string) => void;
  /** The page is thinking about, or carrying out, what was said. */
  busy?: boolean;
  /** What the brief said back: a read-back, or a question about what is missing. */
  reply?: string;
}) {
  const router = useRouter();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [leaving, setLeaving] = useState(false);
  const hero = variant === "hero";
  const working = busy || leaving;

  function go(text: string) {
    const said = text.trim();
    if (!said || working) return;
    if (onCommand) {
      onCommand(said.slice(0, 1500));
      setTyped("");
      return;
    }
    setLeaving(true);
    router.push(`/create?say=${encodeURIComponent(said.slice(0, 1500))}`);
  }

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    onSessionEnd: go,
    // A browser that cannot listen still gets the same front door, typed.
    onUnsupported: () => setTyping(true),
    disabled: working,
  });

  const live = [transcript, interim].filter(Boolean).join(" ");

  // One line under the mic that always says what is happening, because a mic
  // that has gone quiet reads as a mic that has failed.
  const status = listening
    ? (live || "Listening… tap the button when you're done")
    : working
      ? (reply || "Got it. Working on it…")
      : reply || (hero ? "Hit the Mic to Speak" : "Tap and speak");

  return (
    <section
      className={hero
        ? "mt-6 text-center"
        : "mb-6 rounded-2xl border border-spark-rule bg-white px-5 py-6 text-center sm:px-8 sm:py-7"}
    >
      {!hero && (
        <>
          <h2 className="text-[20px] font-bold leading-tight text-spark-ink sm:text-[22px]">
            Say what you want to make
          </h2>
          <p className="mx-auto mt-1 max-w-md text-[14px] leading-snug text-spark-ink-muted">
            One sentence is enough. A blog is written straight away; a video stops at its script until you say go.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={toggle}
        disabled={working}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Hit the mic to speak"}
        className={`relative mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 ${
          hero ? "" : "mt-5"
        } ${listening ? "bg-red-500" : "spark-cta-gradient"}`}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
        {working
          ? <Loader2 size={34} className="animate-spin" />
          : listening ? <Square size={30} className="relative" fill="currentColor" /> : <Mic size={38} className="relative" />}
      </button>

      <p
        className={`mx-auto mt-3 min-h-[1.5rem] max-w-md leading-snug text-spark-ink ${
          !listening && !working && !reply ? "text-[17px] font-bold" : "text-[15px] font-medium"
        }`}
        aria-live="polite"
      >
        {status}
      </p>

      {/* Said as an option, not the only way in: the tiles below still work. */}
      {hero && !listening && !working && (
        <p className="mx-auto mt-0.5 max-w-md text-[14px] leading-snug text-spark-ink-muted">
          {reply
            ? "Tap the mic to answer, or carry on below."
            : "Say it all in one sentence, or choose below."}
        </p>
      )}

      {!listening && !working && !reply && (
        <div className="mx-auto mt-3 max-w-md space-y-1 text-[13px] italic leading-snug text-spark-ink-faint">
          <p>&ldquo;Create a blog for downsizers about one-floor living in Ambler.&rdquo;</p>
          <p>&ldquo;Make a short YouTube video with my avatar and voice about the Blue Bell market.&rdquo;</p>
        </div>
      )}

      {/* The Create page has its own box for typing, in the topic section. */}
      {!hero && (typing ? (
        <form
          onSubmit={(e) => { e.preventDefault(); go(typed); }}
          className="mx-auto mt-4 flex max-w-md items-center gap-2"
        >
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Create a blog about…"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-spark-rule bg-white px-3.5 py-2.5 text-[15px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber"
          />
          <button
            type="submit"
            disabled={!typed.trim() || working}
            className="flex items-center gap-1.5 rounded-xl spark-cta-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Go <ArrowRight size={15} />
          </button>
        </form>
      ) : (
        !listening && !working && (
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="mt-4 text-[13px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Or type it instead
          </button>
        )
      ))}
    </section>
  );
}
