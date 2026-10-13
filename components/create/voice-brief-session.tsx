"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Square } from "lucide-react";
import { saidGoAhead } from "@/lib/utils/wake-word";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

export interface BriefSlots {
  city: string | null;
  state: string | null;
  topic: string | null;
  audience: string | null;
  tone: string | null;
  length: "standard" | "long" | null;
  platform: "reel" | "youtube" | null;
  /** What was asked for, when it was said: "create a blog", "make a video". */
  output?: "blog" | "video" | null;
  /** Who is on screen, when it was said: the avatar, voice only, or the agent on camera. */
  onScreen?: "avatar" | "voice_only" | "camera" | "scenes" | null;
  /** Why it is being made, as one of the Create page's five reasons. */
  purpose?: "found" | "answer" | "appointment" | "topofmind" | "announce" | null;
  /** A forwarded email to make it from, when they asked for one by name. */
  emailId?: string | null;
  emailSubject?: string | null;
}

/**
 * What a topic can become.
 *
 * "video" is a video whose kind has not been chosen yet: the page has one
 * Video / Reel card, and which of the two it is (the avatar, or their voice
 * over scenes) is asked on the page after Send. The two are still kinds of
 * their own, for when the words say which.
 */
export type BriefMake = "video" | "avatar" | "camera" | "scenes" | "blog";

/**
 * A choice tapped in the box, written into the brief as if it had been said.
 * The page already knows what "create a blog" and "I'll record it myself" mean
 * when they are spoken, so a tap takes the same road and there is one of them.
 */
/**
 * What the words in the box already say to make, read before they are sent.
 *
 * The box asks what to make before sending, and it asked even of "create a
 * blog for Ambler", which had just said. The brief only reads the words once
 * they are sent, so this is a small reading of its own, for the obvious cases:
 * a making verb followed closely by the thing, or the thing first. It is
 * deliberately narrow. A topic that merely mentions a blog or a video ("why
 * every agent needs a blog") should still be asked about, and a wrong guess is
 * one tap on Change.
 *
 * `video` is the half-answer: a video was asked for, but not which of the two.
 */
const MAKE_VERB = "(?:create|make|write|draft|spark|generate|do|give me|i need|i want|i'd like|start)";
const SAID_BLOG = new RegExp(`\\b${MAKE_VERB}\\b(?:\\s+[\\w'-]+){0,4}?\\s+(?:blog|article)\\b|^\\s*(?:an?\\s+)?(?:blog|article)\\b`);
const SAID_VIDEO = new RegExp(`\\b${MAKE_VERB}\\b(?:\\s+[\\w'-]+){0,4}?\\s+(?:video|reel|short)\\b|^\\s*(?:an?\\s+)?(?:short\\s+|long\\s+|quick\\s+)?(?:video|reel)\\b`);
const SAID_CAMERA = /\b(?:record(?:ing)?\s+(?:it\s+|this\s+|that\s+|one\s+)?(?:myself|my\s+self)|record\s+(?:a|my|this|the)\s+(?:short\s+|long\s+|quick\s+)?(?:video|reel|short)|i(?:'ll| will|'m going to| am going to| want to)\s+(?:record|film|shoot)|film\s+(?:it\s+|this\s+)?myself|on\s+camera|teleprompter)\b/;
const SAID_AVATAR = /\b(?:my|an|the)\s+avatar\b|\bavatar\s+video\b/;
// By its name, or by what creators call it.
const SAID_SCENES = /\bscenes?\s+(?:reel|video|short)s?\b|\bfaceless\b/;
// "Make a reel about…" is one too. The shapes are called vertical and
// horizontal now, so a reel is a thing to make and not a way to hold the
// phone. Unless they also said who is in it: "a reel with my avatar" and
// "record a reel" are those, in that shape (see saidMake).
const SAID_REEL = new RegExp(`\\b${MAKE_VERB}\\b(?:\\s+[\\w'-]+){0,4}?\\s+reels?\\b|^\\s*(?:an?\\s+)?(?:short\\s+|quick\\s+)?reels?\\b`);
// And "a real about": what the microphone writes when it hears "a reel
// about". Only before a word a topic follows, so "a real estate video" and
// "make a real difference" are left as the words they are.
const HEARD_REAL = new RegExp(`\\b${MAKE_VERB}\\b\\s+(?:an?|another|my)\\s+(?:short\\s+|quick\\s+|new\\s+)?real\\s+(?:about|on|for|of|explaining|showing|that)\\b`);

function saidMake(text: string): { kind: BriefMake | null; video: boolean } {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const video = SAID_VIDEO.test(t);
  const kinds: BriefMake[] = [];
  if (SAID_BLOG.test(t)) kinds.push("blog");
  if (SAID_CAMERA.test(t)) kinds.push("camera");
  if (SAID_AVATAR.test(t)) kinds.push("avatar");
  if (SAID_SCENES.test(t) || (kinds.length === 0 && (SAID_REEL.test(t) || HEARD_REAL.test(t)))) kinds.push("scenes");
  // Exactly one, and not a blog said alongside a video: that is two things.
  if (kinds.length === 1 && !(kinds[0] === "blog" && video)) return { kind: kinds[0], video: false };
  if (kinds.length === 0 && video) return { kind: null, video: true };
  return { kind: null, video: false };
}

function withMake(slots: BriefSlots, make: BriefMake | null): BriefSlots {
  if (!make) return slots;
  if (make === "blog") return { ...slots, output: "blog", onScreen: null };
  // A video, with who is on screen left as the words had it: asked next.
  if (make === "video") return { ...slots, output: "video" };
  return { ...slots, output: "video", onScreen: make };
}

interface Props {
  /** Applies whatever was understood from the words to the page's own fields. */
  onSlots: (slots: BriefSlots) => void;
  /**
   * A whole command arrived from elsewhere (the Dashboard's mic) and turned
   * out to be complete: go. Not called for words spoken or typed here, which
   * fill the page in and wait for Next.
   */
  onReady: (slots: BriefSlots) => void;
  /** The browser cannot listen. The box already takes typing, so this is rarely needed. */
  onSwitchToTyping: () => void;
  disabled?: boolean;
  /**
   * Text dropped into the box from outside: a picked idea or the example line.
   * Carries a nonce because picking the same one twice must still land.
   */
  seed?: { text: string; n: number };
  /** What the words end in, sent with them so they are read the right way. */
  mode?: "script" | "blog";
  /** Whether the box is holding any words. */
  onDraftChange?: (hasDraft: boolean) => void;
  /**
   * The words in the box, as they are typed or heard. The page keeps them as
   * its topic straight away, so Next works without waiting for them to be
   * read; what is understood from them arrives afterwards through onSlots.
   */
  onText?: (text: string) => void;
  /** "Spark it" was said: the same as pressing Next. */
  onGo?: () => void;
  /**
   * A whole command said somewhere else and handed here to carry out. It goes
   * ahead by itself when it turns out to be complete; otherwise it fills in
   * what it can and waits like anything else.
   */
  command?: { text: string; n: number };
  /** Told when a command has been read, so the page stops waiting on it. */
  onReply?: (reply: string) => void;
  /** The topic does not apply on the route that is chosen: the box dims. */
  off?: boolean;
  /** Given while `off`: tapping the mic switches to a route that starts from a topic. */
  onWake?: () => void;
  /** Told what the words say to make, as soon as they say it, to light the matching card. */
  onMakeChange?: (kind: BriefMake) => void;
  /** A card pressed on the page. It wins over the words until they are edited. */
  picked?: { kind: BriefMake; n: number };
  /** Which card is lit on the page now. */
  selected?: BriefMake | null;

  // Accepted so the page's call is unchanged; no longer used here. They
  // belonged to the Send strip and its follow-up questions.
  canMake?: (kind: BriefMake) => boolean;
  picker?: React.ReactNode;
  choicesOnPage?: boolean;
  onShowChoices?: () => void;
  formatSet?: boolean;
  settled?: boolean;
}

/** How long typing has to pause before the words are read. */
const READ_AFTER_MS = 1400;
/** Shorter than this is not yet a sentence worth reading. */
const READ_MIN_CHARS = 12;

/**
 * The topic box: say it, type it, or pick an idea, and the words stay put.
 *
 * It was a conversation. The words were sent with a Send button, the box was
 * emptied for an answer, what had been understood was summarised on a line
 * under it, the app's question appeared beside the mic and again in a box of
 * its own, and the whole exchange was kept in a "Conversation" panel on top.
 * One brief, shown in four places, none of them the box it was typed into.
 * The owner found it "way too confusing" and asked why the topic was under
 * the box instead of in it.
 *
 * So there is no conversation now. The words stay in the box. A moment after
 * they stop, they are read once in the background, and what they say is
 * filled in on the page itself: the card under Create, the city and state,
 * the format, the audience. The page's own controls are the read-back, and
 * its own button, Next, is the way on.
 *
 * What went with it is being asked follow-up questions by voice. Saying more
 * adds to the box and the whole of it is read again, so "in Blue Bell, for
 * first-time buyers" still does what it did.
 */
export function VoiceBriefSession({
  onSlots, onReady, onSwitchToTyping, disabled = false, seed, mode = "script",
  onDraftChange, onText, onGo, command, onReply, off = false, onWake,
  selected = null, onMakeChange, picked,
}: Props) {
  // In refs so the reader and the recogniser, which outlive the render that
  // made them, always call the current ones.
  const onSlotsRef = useRef(onSlots); onSlotsRef.current = onSlots;
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady;
  const onReplyRef = useRef(onReply); onReplyRef.current = onReply;
  const onTextRef = useRef(onText); onTextRef.current = onText;
  const onGoRef = useRef(onGo); onGoRef.current = onGo;
  const onMakeChangeRef = useRef(onMakeChange); onMakeChangeRef.current = onMakeChange;
  const modeRef = useRef(mode); modeRef.current = mode;

  const [draft, setDraft] = useState("");
  const draftRef = useRef(draft); draftRef.current = draft;
  const boxRef = useRef<HTMLTextAreaElement>(null);

  /** The words last read (or dropped in whole, which need no reading). */
  const lastRead = useRef("");
  /** Counts reads, so an answer to words since changed is thrown away. */
  const readSeq = useRef(0);
  /** A command that went ahead, latched so it cannot go twice. */
  const wentRef = useRef(false);

  /**
   * The words a pressed card overrode. A card pressed after "create a blog"
   * was typed is the newer instruction, so the words are not read for what to
   * make until they change.
   */
  const [cardOver, setCardOver] = useState<string | null>(null);
  const cardOverRef = useRef(cardOver); cardOverRef.current = cardOver;
  const selectedRef = useRef(selected); selectedRef.current = selected;

  /** What the words themselves say to make, if they say. */
  const makeFrom = (text: string): BriefMake | null => {
    const said = saidMake(text);
    const kind = cardOverRef.current !== null && cardOverRef.current === text ? null : said.kind;
    // "Make a video about…" said with the Blog card lit is a video.
    const video: BriefMake | null = said.video && (selectedRef.current === "blog" || selectedRef.current == null) ? "video" : null;
    return kind ?? video;
  };

  /**
   * Reads the words once and fills the page in from them.
   *
   * Quiet on purpose: nothing is shown while it runs and nothing is said if
   * it fails, because the page already has the words as its topic and Next
   * works either way. `go` is only for a command handed in from elsewhere.
   */
  const read = useCallback(async (text: string, opts?: { go?: boolean }) => {
    const said = text.trim();
    if (!said) return;
    lastRead.current = text;
    const seq = ++readSeq.current;
    try {
      const res = await fetch("/api/ai/brief-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: [{ role: "user", content: said }], mode: modeRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      // Words changed while this was away: the newer read is the one that counts.
      if (seq !== readSeq.current) return;
      if (!res.ok || !data.slots) { if (opts?.go) onReplyRef.current?.(""); return; }

      const got = withMake(data.slots as BriefSlots, makeFrom(text));
      onSlotsRef.current(got);
      if (opts?.go) {
        onReplyRef.current?.(typeof data.reply === "string" ? data.reply : "");
        const complete = !!(got.topic && got.city && got.state);
        const knowsWhat = !!(got.output || got.onScreen);
        if (complete && knowsWhat && !wentRef.current) {
          wentRef.current = true;
          onReadyRef.current(got);
        }
      }
    } catch {
      if (opts?.go) onReplyRef.current?.("");
    }
    // Everything it calls is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * New words in the box, by hand or by voice.
   *
   * The page is told a beat behind the keys, not on every one: it is a large
   * page, and re-drawing all of it for each letter makes typing drag. Spoken
   * words, a command and Enter tell it straight away.
   */
  const tellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function setWords(text: string, now = false) {
    setDraft(text);
    if (tellTimer.current) clearTimeout(tellTimer.current);
    tellTimer.current = null;
    if (now) { onTextRef.current?.(text); return; }
    tellTimer.current = setTimeout(() => { tellTimer.current = null; onTextRef.current?.(text); }, 250);
  }
  /** Tells the page now, if it has not been told yet. Never repeats what it
   *  already has: by then the page may hold a tidier topic read from these
   *  same words, and telling it again would put the raw sentence back. */
  function flushWords() {
    if (!tellTimer.current) return;
    clearTimeout(tellTimer.current);
    tellTimer.current = null;
    onTextRef.current?.(draftRef.current);
  }
  useEffect(() => () => { if (tellTimer.current) clearTimeout(tellTimer.current); }, []);

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    onSessionEnd: (captured) => {
      const spoken = captured.trim();
      if (!spoken) return;
      const base = draftRef.current.trim();
      // "Spark it", with something already in the box, is Next.
      if (base && saidGoAhead(spoken)) { onGoRef.current?.(); return; }
      // Speech adds to what is there rather than replacing it, so a picked
      // idea followed by "in Blue Bell, PA" is one sentence.
      const text = [base, spoken].filter(Boolean).join(" ");
      setWords(text, true);
      void read(text);
    },
    onUnsupported: onSwitchToTyping,
    disabled,
    // Not while the box is off: Space would fill a box nobody can see into.
    holdSpace: !off,
  });

  // Typed words are read once typing pauses.
  useEffect(() => {
    if (listening || disabled || off) return;
    if (draft.trim().length < READ_MIN_CHARS || draft === lastRead.current) return;
    const id = setTimeout(() => { void read(draft); }, READ_AFTER_MS);
    return () => clearTimeout(id);
  }, [draft, listening, disabled, off, read]);

  // A command from elsewhere: shown in the box, read, and carried out if complete.
  useEffect(() => {
    if (!command?.text) return;
    wentRef.current = false;
    setWords(command.text, true);
    void read(command.text, { go: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.n]);

  // A picked idea lands in the box with the cursor after it, to be added to.
  // It is already a plain topic and the page already has it, so it is not
  // read; adding to it is what gets it read.
  useEffect(() => {
    if (!seed?.text) return;
    setDraft(seed.text);
    lastRead.current = seed.text;
    boxRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.n]);

  // A new generation may be asked for once the page is free again.
  useEffect(() => { if (!disabled) wentRef.current = false; }, [disabled]);

  useEffect(() => { onDraftChange?.(!!draft.trim()); }, [draft, onDraftChange]);

  // Light the card the words name, as they are typed, before anything is read.
  const announce = !off && !!draft.trim() ? makeFrom(draft) : null;
  useEffect(() => {
    if (announce) onMakeChangeRef.current?.(announce);
  }, [announce]);

  // A card pressed on the page: it stands until the words change.
  useEffect(() => {
    if (!picked?.n) return;
    setCardOver(draftRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.n]);

  const live = [transcript, interim].filter(Boolean).join(" ");
  // While the mic is on, what was already there plus the words landing now.
  const boxValue = listening ? [draft.trim(), live].filter(Boolean).join(" ") : draft;

  // Keep the words landing now in view while talking.
  useEffect(() => {
    if (!listening) return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [listening, boxValue]);

  // The mic dims with the box unless tapping it can switch the route on.
  const micOff = off && !onWake;

  return (
    <div className="flex flex-col gap-2">
      {/* Centred, the line above the mic: the arrangement the Dashboard's
          mic card had, which the owner asked for here when that card was
          taken off. The mic and the type are the sizes they were. */}
      <div className={`flex flex-col items-center gap-3 px-1 pb-2 pt-3 text-center ${micOff ? "opacity-45" : ""}`}>
        <h2 className="text-[17px] font-semibold leading-snug text-spark-ink sm:text-[19px]">
          Speak, Type or choose suggested idea
        </h2>
        <button
          type="button"
          onClick={() => {
            // Tapped while the box is off: switch to the route it feeds first.
            if (off && !listening) onWake?.();
            toggle();
          }}
          disabled={disabled || micOff}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Tap the mic and say your topic"}
          className={`relative flex h-20 w-20 flex-none items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-24 sm:w-24 ${
            listening ? "bg-red-500" : "spark-cta-gradient"
          }`}
        >
          {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
          {disabled
            ? <Loader2 size={32} className="animate-spin" />
            : listening ? <Square size={28} className="relative" fill="currentColor" /> : <Mic size={36} className="relative" />}
        </button>
        {/* Only while listening. A mic that has gone quiet with nothing said
            reads as a mic that has failed. */}
        {listening && (
          <p className="text-[15px] leading-snug text-spark-ink-muted sm:text-[16px]" aria-live="polite">
            Listening… tap the mic when you&rsquo;re done.
          </p>
        )}
      </div>

      <div className={off ? "pointer-events-none select-none opacity-45" : ""}>
        <textarea
          ref={boxRef}
          id="brief-box"
          value={boxValue}
          onChange={(e) => setWords(e.target.value)}
          // Leaving the box: the page has the words before anything else is pressed.
          onBlur={flushWords}
          // Locked only while the mic is running, where the recogniser owns the
          // value and a keystroke would be overwritten on the next result.
          readOnly={listening}
          disabled={disabled || off}
          rows={2}
          // No words inside it, at the owner's direction: the line beside the
          // mic already says to speak or type. Named for a screen reader.
          aria-label="Your topic"
          onKeyDown={(e) => {
            // Enter reads the words now instead of starting a new line.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              flushWords();
              if (draft.trim() && draft !== lastRead.current) void read(draft);
            }
          }}
          className="block w-full resize-none rounded-[12px] border border-spark-rule bg-white px-3.5 py-2.5 text-[16px] leading-[1.5] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber disabled:opacity-60"
        />
      </div>
    </div>
  );
}
