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
 *   brief's answer beside the mic, because the panel that answer lives in is
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

  /**
   * The hero, at the top of the Create page: a card with the mic on the left
   * and the words on the right.
   *
   * It was a centred mic with a slogan under it, "Hit the Mic to Speak", and
   * two example sentences naming real towns. The card says what the mic is
   * FOR ("Tell us what you want to create") and what the alternative is, in
   * the order someone reads them, and offers one example that would be true
   * of any market.
   *
   * One line under the title always says what is happening, because a mic
   * that has gone quiet reads as a mic that has failed: the instruction while
   * idle, the words as they land while listening, and afterwards what the
   * brief said back.
   */
  if (hero) {
    const idle = !listening && !working && !reply;
    const line = listening
      ? (live || "Listening… tap the mic when you're done.")
      : working
        ? (reply || "Got it. Working on it…")
        : reply || "Tap the mic and describe your topic, or choose an option below.";

    return (
      <section className="mt-6 flex items-center gap-4 rounded-2xl border border-spark-rule bg-white px-4 py-4 text-left shadow-[0_2px_14px_rgba(44,44,42,0.05)] sm:gap-6 sm:px-6 sm:py-5">
        <button
          type="button"
          onClick={toggle}
          disabled={working}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Tap the mic and say what you want to create"}
          className={`relative flex h-20 w-20 flex-none items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 sm:h-24 sm:w-24 ${
            listening ? "bg-red-500" : "spark-cta-gradient"
          }`}
        >
          {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
          {working
            ? <Loader2 size={32} className="animate-spin" />
            : listening ? <Square size={28} className="relative" fill="currentColor" /> : <Mic size={36} className="relative" />}
        </button>

        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-bold leading-tight text-spark-ink sm:text-[23px]">
            Tell us what you want to create
          </h2>
          <p
            className={`mt-1 leading-snug ${
              idle ? "text-[15px] text-spark-ink-muted sm:text-[16px]" : "text-[15px] font-medium text-spark-ink sm:text-[16px]"
            }`}
            aria-live="polite"
          >
            {line}
          </p>

          {/* After an answer: how to reply to it, since the mic is the way. */}
          {!listening && !working && reply && (
            <p className="mt-1 text-[14px] leading-snug text-spark-ink-muted">
              Tap the mic to answer, or carry on below.
            </p>
          )}

          {/* One example, and one any agent could say. The two it replaces
              named towns from one county. */}
          {idle && (
            <p className="mt-2.5 inline-block rounded-xl bg-[#f4f2e8] px-3 py-1.5 text-[14px] leading-snug text-spark-ink-soft sm:text-[15px]">
              Try: &ldquo;Create a blog about preparing a home for sale.&rdquo;
            </p>
          )}
        </div>
      </section>
    );
  }

  // One line under the mic that always says what is happening, because a mic
  // that has gone quiet reads as a mic that has failed.
  const status = listening
    ? (live || "Listening… tap the button when you're done")
    : working
      ? (reply || "Got it. Working on it…")
      : reply || "Tap and speak";

  return (
    <section className="mb-6 rounded-2xl border border-spark-rule bg-white px-5 py-6 text-center sm:px-8 sm:py-7">
      <h2 className="text-[20px] font-bold leading-tight text-spark-ink sm:text-[22px]">
        Say what you want to make
      </h2>
      <p className="mx-auto mt-1 max-w-md text-[14px] leading-snug text-spark-ink-muted">
        One sentence is enough. A blog is written straight away; a video stops at its script until you say go.
      </p>

      <button
        type="button"
        onClick={toggle}
        disabled={working}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Tap the mic and speak"}
        className={`relative mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 ${
          listening ? "bg-red-500" : "spark-cta-gradient"
        }`}
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

      {!listening && !working && !reply && (
        <div className="mx-auto mt-3 max-w-md space-y-1 text-[13px] italic leading-snug text-spark-ink-faint">
          <p>&ldquo;Create a blog for downsizers about one-floor living in Ambler.&rdquo;</p>
          <p>&ldquo;Make a short YouTube video with my avatar and voice about the Blue Bell market.&rdquo;</p>
        </div>
      )}

      {typing ? (
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
      )}
    </section>
  );
}
