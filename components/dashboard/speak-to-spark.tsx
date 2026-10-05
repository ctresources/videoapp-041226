"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Mic, Square } from "lucide-react";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

/**
 * The front door, on a phone especially: one mic, one sentence.
 *
 * Voice already ran the Create page, but only once you had found it, chosen a
 * route and decided to speak. This puts the same thing first: open the app,
 * say "create a blog about…" or "make a short video with my avatar about…",
 * and the sentence is handed to the Create page's voice brief to carry out.
 *
 * It only listens and passes the words on. Understanding them, and deciding
 * whether the command is complete, is the brief's job, so there is one place
 * that knows what a command means, however it arrives.
 *
 * Nothing said here can spend a video: a blog is written outright, and a
 * video stops at its script and setup screen, where rendering is its own
 * deliberate step.
 */
export function SpeakToSpark() {
  const router = useRouter();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [going, setGoing] = useState(false);

  function go(text: string) {
    const said = text.trim();
    if (!said || going) return;
    setGoing(true);
    router.push(`/create?say=${encodeURIComponent(said.slice(0, 1500))}`);
  }

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    onSessionEnd: go,
    // A browser that cannot listen still gets the same front door, typed.
    onUnsupported: () => setTyping(true),
    disabled: going,
  });

  const live = [transcript, interim].filter(Boolean).join(" ");

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
        disabled={going}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Start speaking"}
        className={`relative mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:opacity-60 ${
          listening ? "bg-red-500" : "spark-cta-gradient"
        }`}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
        {going
          ? <Loader2 size={34} className="animate-spin" />
          : listening ? <Square size={30} className="relative" fill="currentColor" /> : <Mic size={38} className="relative" />}
      </button>

      {/* One line under the mic that always says what is happening, because a
          mic that has gone quiet reads as a mic that has failed. */}
      <p className="mt-3 min-h-[1.5rem] text-[14px] font-medium text-spark-ink-soft" aria-live="polite">
        {going
          ? "Got it. Setting it up…"
          : listening
            ? (live || "Listening… tap the button when you're done")
            : "Tap and speak"}
      </p>

      {!listening && !going && (
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
            disabled={!typed.trim() || going}
            className="flex items-center gap-1.5 rounded-xl spark-cta-gradient px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Go <ArrowRight size={15} />
          </button>
        </form>
      ) : (
        !listening && !going && (
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
