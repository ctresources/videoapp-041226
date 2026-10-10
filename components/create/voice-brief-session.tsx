"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Mic, ChevronDown, ChevronUp, CheckCircle, Loader2, Square } from "lucide-react";
import { saidGoAhead } from "@/lib/utils/wake-word";
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";

/**
 * The opening line, and deliberately not a question any more.
 *
 * It was "What are we sparking today?" — sitting a couple of inches under a
 * section heading already asking "What is your video about?", and directly
 * above a chip asking "What's it about?". One question, three wordings, which
 * reads as three separate things wanted rather than one.
 *
 * So this line stops asking and starts telling you what you can pack into the
 * answer, which is the thing nobody discovers: that the whole brief can go in
 * one sentence. Only the opening state — the moment you speak, this becomes
 * the assistant's real reply and everything below is unchanged.
 */
/**
 * Moved to the hero mic at the top of the Create page, which is where someone
 * is deciding what to say. Down here it was the same advice given after two
 * rows of tiles had already been scrolled past.
 *
 * Empty rather than removed: this is still turns[0], the seat the assistant's
 * real reply takes the moment you speak. Only the opening state is silent.
 */
const OPENING_LINE = "";


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

const EMPTY_SLOTS: BriefSlots = {
  city: null, state: null, topic: null, audience: null, tone: null, length: null, platform: null,
  output: null, onScreen: null, purpose: null, emailId: null, emailSubject: null,
};

interface Turn {
  role: "user" | "assistant";
  content: string;
}

/** The four things a topic can become, as the box offers them. */
export type BriefMake = "avatar" | "camera" | "scenes" | "blog";

const MAKES: { kind: BriefMake; label: string }[] = [
  { kind: "avatar", label: "Avatar video" },
  { kind: "camera", label: "Record yourself" },
  // Your voice over scenes made for the script, with nobody on screen.
  { kind: "scenes", label: "Scenes Reel" },
  { kind: "blog", label: "Blog" },
];

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
  return { ...slots, output: make === "blog" ? "blog" : "video", onScreen: make === "blog" ? null : make };
}

interface Props {
  /** Applies whatever the conversation has established. */
  onSlots: (slots: BriefSlots) => void;
  /**
   * The agent said the wake word and the brief is complete.
   *
   * Receives the slots directly. onSlots and onReady fire in the same tick, so
   * anything onReady read back from React state would be a render behind — and
   * one utterance carrying the whole brief plus the wake word is exactly the
   * case where that state is still empty.
   */
  onReady: (slots: BriefSlots) => void;
  /** Escape hatch — hands over to the typed form. */
  onSwitchToTyping: () => void;
  disabled?: boolean;
  /**
   * Text dropped into the box from outside — picking a trending topic or a
   * template. It lands as a draft rather than being sent, so it can be added
   * to ("...aimed at downsizers") before it counts as your turn.
   *
   * Carries a nonce because picking the same topic twice must still land.
   */
  seed?: { text: string; n: number };
  /**
   * What this brief ends in.
   *
   * The conversation is the same either way, but the thing it produces is not,
   * and this panel said "script" in three places while the button below it said
   * "Write the blog" — two buttons that call the identical handler, disagreeing
   * about what they do. Defaults to "script" so the camera instance and every
   * other caller are untouched.
   */
  mode?: "script" | "blog";
  /**
   * Whether the box is holding words that have not been sent yet.
   *
   * The page's own state only fills once a turn has round-tripped, so an
   * unsent draft left the footer saying "say or pick what this is about"
   * while the topic sat visible in the box above it — the screen telling you
   * to supply the thing you could see. The panel is the only thing that knows,
   * so it says.
   */
  onDraftChange?: (hasDraft: boolean) => void;
  /**
   * A whole command said somewhere else, the home-screen mic, and handed here
   * to carry out.
   *
   * Unlike `seed`, it is sent at once and goes ahead without the wake word if
   * it turns out to be complete. That is the difference between a conversation
   * and a command: here on the Create page you are building a brief and say
   * when it is done; on the home screen "create a blog about…" already is the
   * instruction. If something required is missing, it becomes an ordinary
   * conversation and the assistant asks for it.
   *
   * Carries a nonce so the same sentence said twice still lands.
   */
  command?: { text: string; n: number };
  /**
   * What the brief answered, after every turn: a read-back, a question about
   * what is missing, or "" when the turn could not be answered at all.
   *
   * For the mic at the top of the page, which hands its sentence down here.
   * This panel sits two sections below it, so without this the answer to a
   * command spoken up there appeared off screen.
   */
  onReply?: (reply: string) => void;
  /**
   * The brief does not apply on the route that is chosen: the box dims and
   * takes no typing. `disabled` is the other thing, the page being busy
   * writing, when nothing here should respond at all.
   */
  off?: boolean;
  /**
   * Given while `off`, where switching to a route that starts from a topic
   * loses nothing: called as the mic is tapped, so speaking is always a way
   * in. Without it the mic dims with the box.
   */
  onWake?: () => void;
  /**
   * Asked as one of the three things to make is tapped: whether this account
   * may make it. The page owns the answer (and says why not, when not), since
   * the same lock sits on its cards.
   */
  canMake?: (kind: BriefMake) => boolean;
  /**
   * Told as soon as it is known what is being made, before anything is sent:
   * read from the words in the box, or tapped here. For the page to light the
   * matching card. The owner typed "create a blog", saw "Making: Blog" under
   * the box, and the cards below still had Avatar video lit.
   */
  onMakeChange?: (kind: BriefMake) => void;
  /**
   * A card pressed on the page, so the box follows it the other way. Carries
   * a nonce because pressing the same card twice must still land.
   */
  picked?: { kind: BriefMake; n: number };
  /**
   * The page's own choices of what to make, drawn between the box and Send.
   *
   * The box asked what to make with four buttons, and the page asked again
   * with a row of cards two sections down: the same question twice. With
   * this, the cards are the one place it is asked, and the strip under them
   * only says which is chosen and offers Send.
   */
  picker?: React.ReactNode;
  /** Which of them is chosen on the page now. Null where none of the four is. */
  selected?: BriefMake | null;
  /**
   * The thing has been written and is waiting on the page: a camera script in
   * its teleprompter. The box stops offering to make it, since a tap there
   * would write over a script that may have been edited.
   */
  settled?: boolean;
}

/**
 * The spoken brief — design 3b, restyled compact.
 *
 * Originally a tall standalone card: its own shaded panel, a 92px mic, an
 * 18-bar waveform, and the current question set as a page-sized heading. That
 * made sense when it was the only way in, but it now sits as one row inside
 * the page's "Your topic" section, next to trending and templates — other
 * paths to the same field — and looking like a separate destination fought
 * that. Modelled on the editor's compact voice row (36px mic, two lines of
 * text) rather than its own previous design.
 *
 * No "Captured so far" column, which the mock drew down the right-hand side.
 * The slots this fills are the Create page's own fields, already on screen —
 * a second view of the same brief would be two things to keep in agreement.
 * A short summary line here is not that: it is a glance at what voice itself
 * has captured this conversation, not a duplicate of the form.
 */
export function VoiceBriefSession({ onSlots, onReady, onSwitchToTyping, disabled = false, seed, mode = "script", onDraftChange, command, onReply, off = false, onWake, canMake, picker, selected = null, settled = false, onMakeChange, picked }: Props) {
  // In a ref so `send` calls the current one without being rebuilt for it.
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", content: OPENING_LINE }]);
  const [thinking, setThinking] = useState(false);
  const [slots, setSlots] = useState<BriefSlots>(EMPTY_SLOTS);
  const [showTranscript, setShowTranscript] = useState(false);
  // What is in the box. Speech fills it, and it stays editable afterwards so a
  // misheard word can be fixed by hand instead of by saying the whole thing
  // again — "Ambler" coming back as "Amber" should cost one keystroke.
  const [draft, setDraft] = useState("");
  /** True between the mic stopping and the turn being sent, so the status line
   *  can say the words landed rather than leaving silence to speak for itself. */
  const [justHeard, setJustHeard] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Guards against a second submit while a turn is in flight, without waiting
  // for the `thinking` state to land.
  const busyRef = useRef(false);
  /**
   * What to make, once it has been chosen in the box.
   *
   * Send used to decide by itself: whatever card was lit further down the
   * page, an avatar video unless something else had been pressed. The owner
   * spoke a topic, pressed Send, and was never asked. So the box asks, before
   * anything is sent, and the answer rides with every turn after it. In a ref
   * as well, because `send` outlives the render that made it.
   */
  const [make, setMake] = useState<BriefMake | null>(null);
  const makeRef = useRef<BriefMake | null>(null);
  /** Change was pressed: show all three, whatever was chosen or said. */
  const [askAll, setAskAll] = useState(false);
  /**
   * The words a pressed card overrode. A card pressed after "create a blog"
   * was typed is the newer instruction, so the words are not read for what to
   * make until they change.
   */
  const [cardOver, setCardOver] = useState<string | null>(null);

  // `send` reads the transcript through a ref so it never closes over a stale
  // turn list — the recogniser's callback outlives the render that made it.
  const turnsRef = useRef(turns);
  turnsRef.current = turns;

  // Same reason: the wake word can arrive on the recogniser's callback, which
  // outlives the render that made it, and it must hand over the slots as they
  // stand now rather than as they were when that callback was created.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Declared ahead of `send`, which sets it when a command goes straight through.
  const [sparking, setSparking] = useState(false);
  const sparkingRef = useRef(false);

  const send = useCallback(async (spoken: string, opts?: { go?: boolean }) => {
    const said = spoken.trim();
    if (!said || busyRef.current) return;
    busyRef.current = true;

    const next: Turn[] = [...turnsRef.current, { role: "user", content: said }];
    setTurns(next);
    setThinking(true);
    try {
      const res = await fetch("/api/ai/brief-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turns: next, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 503 means the brief model is unavailable. Stranding someone mid
        // sentence with a mic that will not answer is worse than handing them
        // the form they can always fall back to.
        if (res.status === 503) {
          toast.error("The voice session isn't available right now — switched you to typing.");
          onReplyRef.current?.("");
          onSwitchToTyping();
          return;
        }
        throw new Error((data.error as string) || `Brief failed (${res.status})`);
      }

      const got = withMake(data.slots as BriefSlots, makeRef.current);
      onSlots(got);
      setSlots(got);
      setTurns((t) => [...t, { role: "assistant", content: data.reply as string }]);
      onReplyRef.current?.(typeof data.reply === "string" ? data.reply : "");
      // A command goes as soon as it is complete, with no wake word: it was an
      // instruction when it was said. Latched like the button, so nothing can
      // fire a second generation while this one is starting.
      //
      // But only once it is known what to make, tapped here or said in the
      // sentence. Otherwise it stops, and the box asks.
      const complete = !!(got.topic && got.city && got.state);
      const knowsWhat = !!(got.output || got.onScreen);
      if (data.ready === true || (opts?.go && complete && knowsWhat && !sparkingRef.current)) {
        sparkingRef.current = true;
        setSparking(true);
        onReady(got);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't follow that — try again.");
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "Sorry — I didn't catch that. Say it again?" },
      ]);
      onReplyRef.current?.("Sorry, I didn't catch that. Say it again?");
    } finally {
      setThinking(false);
      busyRef.current = false;
    }
    // `mode` goes in the request body, so it belongs here. In practice the
    // three callbacks above are inline arrows that change identity every
    // render, which rebuilds this anyway — but relying on that to keep a
    // captured value fresh is luck, not design.
  }, [onSlots, onReady, onSwitchToTyping, mode]);

  // Everything the script actually needs. Until these are in, saying the wake
  // word would start a render of a brief with no place or no subject.
  const briefReady = !!(slots.topic && slots.city && slots.state);

  // `sparking` (declared above `send`) is latched the moment we hand over, so
  // a second click or a repeated wake word cannot fire two generations in the
  // tick before `disabled` arrives.

  /**
   * Go — from the button, or from hearing the wake word.
   *
   * Fires straight off the slots this session already holds rather than posting
   * "Spark script" as another turn. `ready` is decided server-side, so the wake
   * word only did something after a full model round trip — several seconds in
   * which the card said nothing had changed, and the thing anyone does while
   * nothing is happening is say it again. Recognising it needs no model:
   * saidGoAhead is the same matcher the server runs, and the brief is already
   * complete on this side.
   */
  const sparkNow = useCallback(() => {
    if (sparkingRef.current || busyRef.current || disabled) return;
    sparkingRef.current = true;
    setSparking(true);
    onReady(slotsRef.current);
  }, [disabled, onReady]);

  // The parent holds `disabled` on while it generates. Coming back off means
  // the generation failed and this card is live again — so the button and the
  // wake word both have to work a second time.
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled) {
      sparkingRef.current = false;
      setSparking(false);
    }
    wasDisabled.current = disabled;
  }, [disabled]);

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    // Stopping ends your turn and the session answers — asks for whatever is
    // still missing, or reads the brief back and asks if you are done.
    // Leaving the words sitting in the box waiting for Send meant that falling
    // silent looked like nothing had happened at all.
    //
    // What you said stays visible on the "You said" line, and a correction
    // goes as another turn: the session re-reads the whole conversation each
    // time, so a later sentence overrides an earlier one.
    onSessionEnd: (captured) => {
      const spoken = captured.trim();
      if (!spoken) return;
      // Speech adds to what is already in the box rather than replacing it.
      // Picking a trending topic and then saying "in Blue Bell, PA" is the
      // whole reason a pick lands as a draft instead of being sent — but the
      // mic used to own the box outright, so the topic vanished the moment you
      // pressed it and only the spoken half was ever sent.
      const base = draft.trim();
      const text = [base, spoken].filter(Boolean).join(" ");

      // The wake word, once the brief is genuinely complete: go now rather than
      // spend a model round trip being told what a regex already knows. The
      // turn is still recorded, so the transcript reads the way it was said.
      //
      // Only when the wake word is the whole of what was said — with unsent
      // text still in the box, that text has to reach the brief first, so it
      // goes as a turn and the server decides `ready` the usual way. A command
      // is the one thing that does not wait to be checked: you already said it
      // on purpose, and reading it back would be asking twice.
      if (!base && briefReady && saidGoAhead(spoken)) {
        setDraft("");
        setTurns((t) => [...t, { role: "user", content: spoken }]);
        sparkNow();
        return;
      }

      /**
       * The words stay in the box.
       *
       * Falling silent used to send the turn and empty the box, so what you had
       * just said appeared only on a "You said" line above it — read-only, and
       * one of three places the same brief was being shown at once. Speech
       * recognition mishears towns and street names constantly, and this is a
       * script about a specific address: seeing "Shagbark" come back as
       * "Shanbar" matters, and it has to be somewhere you can fix it.
       *
       * So the transcript lands where typed text lands, and goes when you send
       * it. The cost is a second action after speaking; the status line below
       * carries that, because silence followed by nothing visibly happening is
       * the failure this behaviour was introduced to avoid.
       */
      setDraft(text);
      setJustHeard(true);
    },
    onUnsupported: onSwitchToTyping,
    disabled: disabled || thinking,
    // Not while the box is off: Space would fill a box nobody can see into.
    holdSpace: !off,
  });

  // A command from the home-screen mic: sent the moment it arrives.
  useEffect(() => {
    if (!command?.text) return;
    // A turn already in flight would swallow this one without a word, and the
    // mic that sent it would wait forever for an answer. Say so instead.
    if (busyRef.current) { onReplyRef.current?.(""); return; }
    void send(command.text, { go: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.n]);

  // A picked topic lands in the box and puts the cursor after it, so it reads
  // as a starting point you can add to rather than a decision already made.
  useEffect(() => {
    if (!seed?.text) return;
    setDraft(seed.text);
    boxRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.n]);

  // Keep the newest exchange in view as the conversation grows, but only while
  // the transcript is actually open — no point animating a scroll no one sees.
  useEffect(() => {
    if (!showTranscript) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, thinking, showTranscript]);

  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant")?.content ?? "";
  const live = [transcript, interim].filter(Boolean).join(" ");

  // One box for both ways in. Speech fills it, typing corrects it, and a
  // misheard town costs a keystroke rather than saying the whole brief again.
  //
  // While the mic is on it shows what was already there plus the words landing
  // now — the same string that will be sent. It used to show the live
  // transcript alone, so pressing the mic wiped a topic you had just picked
  // off the screen, and there was no way to tell it had only gone from view
  // rather than been thrown away. It had in fact been thrown away.
  const boxValue = listening ? [draft.trim(), live].filter(Boolean).join(" ") : draft;

  // Two rows is not many. Once speech is appending to a topic already in the
  // box, the words landing now sit below the fold — so the one thing you want
  // to watch while talking is the one thing you cannot see.
  useEffect(() => {
    if (!listening) return;
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [listening, boxValue]);

  /**
   * Tell the page when the box is holding something unsent.
   *
   * Only the typed/heard draft counts, not the live transcript: while the mic
   * is running the words have not landed anywhere yet, and the footer should
   * not start talking about Send before Send exists — it appears only once the
   * mic stops.
   */
  useEffect(() => {
    onDraftChange?.(!!draft.trim());
  }, [draft, onDraftChange]);

  function submitDraft() {
    const text = draft.trim();
    if (!text || thinking || disabled || off) return;
    setDraft("");
    setJustHeard(false);
    // Typed or spoken, the wake word does the same thing.
    if (briefReady && saidGoAhead(text)) {
      setTurns((t) => [...t, { role: "user", content: text }]);
      sparkNow();
      return;
    }
    // Goes as another turn. The session re-reads the whole conversation each
    // time, so a corrected sentence overrides what it heard before — the same
    // mechanism that makes "actually, make it sellers" work.
    // Goes ahead when it is complete and it is known what to make: tapped
    // here, read from the words before sending, or worked out by the brief
    // from the sentence. If none of those, it is read back and the box asks.
    setAskAll(false);
    send(text, { go: true });
  }

  /** One of the three, tapped while words wait in the box: choose, and send. */
  function chooseAndSend(kind: BriefMake) {
    if (!draft.trim() || thinking || disabled || off) return;
    if (canMake && !canMake(kind)) return;
    makeRef.current = kind;
    setMake(kind);
    // The box is about to empty, so the page is told here, not by the effect
    // that watches the words.
    onMakeChangeRef.current?.(kind);
    submitDraft();
  }

  // What the strip under the box offers. A choice already made, or one the
  // words in the box state, is shown with a plain Send; Change asks again.
  //
  // The words win over an earlier choice: "make a video with my avatar", typed
  // after a blog was made, means a video. A card pressed since those words
  // were typed wins over them, until they are edited.
  const said = saidMake(draft);
  const saidKind = cardOver !== null && cardOver === draft ? null : said.kind;
  // With the cards in the box, the one that is lit is the answer unless the
  // words say otherwise, so there is always something to send as.
  const making: BriefMake | null = picker
    ? (saidKind ?? selected ?? make)
    : askAll ? null : (saidKind ?? make);
  const offered = !askAll && !make && said.video
    ? MAKES.filter((m) => m.kind !== "blog")
    : MAKES;

  // Tell the page, so its cards agree with what the strip under the box says.
  // Only while words are in the box, and not where the box is switched off.
  const onMakeChangeRef = useRef(onMakeChange);
  onMakeChangeRef.current = onMakeChange;
  const announce = !off && !!draft.trim() ? making : null;
  useEffect(() => {
    if (announce) onMakeChangeRef.current?.(announce);
  }, [announce]);

  // A card pressed on the page: the box follows it.
  useEffect(() => {
    if (!picked?.n) return;
    makeRef.current = picked.kind;
    setMake(picked.kind);
    setAskAll(false);
    setCardOver(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked?.n]);

  /** One of the three, tapped once the brief is already complete: go. */
  function chooseAndGo(kind: BriefMake) {
    if (sparkingRef.current || busyRef.current || disabled) return;
    if (canMake && !canMake(kind)) return;
    makeRef.current = kind;
    setMake(kind);
    onMakeChangeRef.current?.(kind);
    const got = withMake(slotsRef.current, kind);
    setSlots(got);
    onSlots(got);
    sparkingRef.current = true;
    setSparking(true);
    onReady(got);
  }

  // What voice has captured so far, condensed to one line — the compact
  // stand-in for the big centered heading the old design used.
  const summary = [
    slots.output === "blog" ? "blog" : slots.output === "video" ? "video" : null,
    slots.onScreen === "avatar" ? "your avatar" : slots.onScreen === "voice_only" ? "voice only" : slots.onScreen === "camera" ? "you on camera" : slots.onScreen === "scenes" ? "a Scenes Reel" : null,
    slots.city && slots.state ? `${slots.city}, ${slots.state}` : slots.city,
    slots.topic,
    slots.emailSubject ? "from your email" : null,
    slots.audience,
    slots.length === "long" ? "long length" : slots.length === "standard" ? "standard length" : null,
  ].filter(Boolean).join(" · ");

  // Only while it is doing something. What to do with words that have just
  // landed is said under the box, beside the button it is about.
  const status = thinking
    ? "Thinking…"
    : listening
      ? "Listening… tap the mic when you're done."
      : "";

  /**
   * What is still needed, in the page's own words.
   *
   * The assistant asks for it too, beside the mic, but in whatever sentence it
   * comes up with. This is the same thing said the same way every time, next
   * to the box the answer goes in, with what to do about it.
   */
  const hasSpokenTurn = turns.some((t) => t.role === "user");
  const missing = [
    !slots.topic ? "what it's about" : null,
    !slots.city ? "the town" : !slots.state ? "the state" : null,
  ].filter(Boolean).join(" and ");

  // The mic dims with the box unless tapping it can switch the route on.
  const micOff = off && !onWake;

  return (
    <div className="flex flex-col gap-2">
      {/* The conversation reads above the box it is typed into, the way every
          other conversation on a screen does. It used to open underneath —
          below the box and below the summary — so the question you were
          answering sat further down the page than your answer to it. The
          toggle moved up with it rather than staying by the summary: a control
          at the bottom opening a panel at the top is two places to look. */}
      {turns.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="flex items-center gap-1 text-[12px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Conversation
            {showTranscript ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      )}

      {showTranscript && turns.length > 1 && (
        <div
          ref={scrollRef}
          className="spark-surface max-h-[140px] overflow-y-auto rounded-[9px] border border-spark-rule px-3.5 py-2.5"
        >
          <div className="flex flex-col gap-1.5">
            {turns.map((t, i) => (
              <p
                key={i}
                className={`text-[13px] leading-[1.5] ${
                  t.role === "user" ? "text-spark-ink" : "text-spark-ink-faint"
                }`}
              >
                {t.role === "user" ? "" : "— "}
                {t.content}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* The "You said" line is gone: what you said now sits in the box, where
          it can be corrected instead of only read. Three copies of the same
          brief on one screen — above the box, in it, and summarised below —
          was the confusion, not the absence of a fourth. */}

      {/* The big mic and the box, in one card.
          They were two cards: this mic above, sending its sentence the moment
          you stopped talking, and a box below with a small mic of its own.
          The owner asked for one, and for what is said to show in the box,
          which is where typed words already went and where either kind can be
          corrected. So this is that mic, driving this session's recogniser:
          the words land below as they are heard, and wait for Send.

          The sentence beside it is the owner's, moved here from under the
          section heading. The line under that is only for what is happening:
          listening, thinking, words waiting to be sent, or what the brief said
          back. */}
      <div className={`flex items-center gap-4 px-1 pb-1.5 pt-2 sm:gap-6 sm:px-2 sm:pt-2.5 ${micOff ? "opacity-45" : ""}`}>
        <button
          type="button"
          onClick={() => {
            // Tapped while the box is off: switch to the route it feeds first.
            if (off && !listening) onWake?.();
            toggle();
          }}
          disabled={disabled || thinking || micOff}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Tap the mic and say your topic"}
          className={`relative flex h-20 w-20 flex-none items-center justify-center rounded-full text-white shadow-md transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 sm:h-24 sm:w-24 ${
            listening ? "bg-red-500" : "spark-cta-gradient"
          }`}
        >
          {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-40" />}
          {thinking || sparking
            ? <Loader2 size={32} className="animate-spin" />
            : listening ? <Square size={28} className="relative" fill="currentColor" /> : <Mic size={36} className="relative" />}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-snug text-spark-ink sm:text-[19px]">
            Speak, Type or choose suggested idea
          </h2>
          {(status || lastAssistant) && (
            <p
              className={`mt-1 text-[15px] leading-snug sm:text-[16px] ${status ? "text-spark-ink-muted" : "font-medium text-spark-ink"}`}
              aria-live="polite"
            >
              {status || lastAssistant}
            </p>
          )}
        </div>
      </div>

      {/* Everything that is the box: dimmed together when the brief does not
          apply, while the mic above may stay lit. */}
      <div className={`flex flex-col gap-2 ${off ? "pointer-events-none select-none opacity-45" : ""}`}>
      <textarea
        ref={boxRef}
        id="brief-box"
        value={boxValue}
        onChange={(e) => {
          setDraft(e.target.value);
          setJustHeard(false);
          // Emptied and started again: read the new words afresh.
          if (!e.target.value.trim()) setAskAll(false);
        }}
        // Locked only while the mic is running, where the recogniser owns the
        // value and a keystroke would be overwritten on the next result.
        readOnly={listening}
        disabled={disabled || off}
        rows={2}
        placeholder="Speak or Type…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (making) chooseAndSend(making);
            else submitDraft();
          }
        }}
        // Ringed while it holds words that have just been heard and not yet
        // sent, so the thing needing a look is the thing that looks different.
        className={`block w-full resize-none rounded-[12px] border bg-white px-3.5 py-2.5 text-[16px] leading-[1.5] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none focus:ring-2 focus:ring-spark-amber disabled:opacity-60 ${
          justHeard && !listening ? "border-spark-amber ring-2 ring-spark-amber/35" : "border-spark-rule"
        }`}
      />
      </div>

      {/* What to make. Outside the part that dims: when the box does not
          apply (a listing, say), these are how you get back to where it does. */}
      {picker && (
        <div>
          <p className="mb-1.5 text-[13.5px] font-semibold text-spark-ink">What are you sparking?</p>
          {picker}
        </div>
      )}

      <div className={`flex flex-col gap-2 ${off ? "pointer-events-none select-none opacity-45" : ""}`}>

      {/* Words waiting in the box, spoken or typed.
          The owner tried it and stopped here twice. First nothing said whether
          to press Send, or whether the rest of the page still had to be
          filled in. Then Send wrote an avatar video without asking what was
          wanted. So this is where it is asked, before anything goes: the three
          things a topic can become, and tapping one sends. It cannot say "I
          have everything" yet, because the words are only read once sent.

          Once chosen, answering a follow-up ("which town?") is a plain Send:
          the choice is kept, shown, and can be changed. */}
      {!listening && !!draft.trim() ? (
        <div className="rounded-[12px] border border-spark-amber/40 bg-spark-amber-tint px-3.5 py-3">
          {making ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 flex-1 basis-[200px] text-[15px] font-semibold leading-snug text-spark-ink">
                Check your words, then press Send.
                <span className="mt-0.5 block text-[13.5px] font-normal text-spark-ink-muted">
                  Making: <strong className="font-semibold text-spark-ink">{MAKES.find((m) => m.kind === making)?.label}</strong>.{" "}
                  {picker ? "Choose another above to change it." : (
                  <button
                    type="button"
                    onClick={() => { makeRef.current = null; setMake(null); setAskAll(true); }}
                    className="font-semibold text-spark-blue underline underline-offset-2 hover:text-spark-blue-deep"
                  >
                    Change
                  </button>
                  )}
                </span>
              </p>
              <button
                type="button"
                onClick={() => chooseAndSend(making)}
                disabled={thinking || disabled || off}
                className="flex-none rounded-full bg-spark-blue px-7 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-spark-blue-deep disabled:cursor-not-allowed disabled:bg-spark-rule-dim"
              >
                Send
              </button>
            </div>
          ) : (
            <>
              <p className="text-[15px] font-semibold leading-snug text-spark-ink">
                {offered.length < MAKES.length
                  ? "Check your words, then choose which kind of video."
                  : "Check your words, then choose what to make."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {offered.map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => chooseAndSend(kind)}
                    disabled={thinking || disabled || off}
                    className="rounded-full bg-spark-blue px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-spark-blue-deep disabled:cursor-not-allowed disabled:bg-spark-rule-dim"
                  >
                    {label}
                  </button>
                ))}
                {offered.length < MAKES.length && (
                  <button
                    type="button"
                    onClick={() => setAskAll(true)}
                    className="px-1 text-[14px] font-semibold text-spark-blue underline underline-offset-2 hover:text-spark-blue-deep"
                  >
                    Something else
                  </button>
                )}
              </div>
              <p className="mt-2 text-[13.5px] leading-snug text-spark-ink-muted">
                I&rsquo;ll start writing and ask if anything is missing. The steps below are optional.
              </p>
            </>
          )}
        </div>
      ) : (
      <div className="flex items-center gap-2.5">
        {/* What the session has actually understood — the town, the subject,
            the audience — accumulated across every turn. Labelled, because
            unlabelled it read as a third copy of the sentence in the box
            rather than the different thing it is: the box is what you are
            about to say, this is what has been taken from everything you have
            said so far. Only while the brief is still being built. */}
        {summary && !briefReady && (
          <p className="min-w-0 flex-1 truncate text-[12px] leading-[1.45] text-spark-ink-muted">
            <span className="font-semibold text-spark-ink-faint">Brief so far:</span> {summary}
          </p>
        )}
        {(!summary || briefReady) && <span className="flex-1" />}
      </div>
      )}

      {/* Sent, and something is still missing. */}
      {hasSpokenTurn && !briefReady && !!missing && !thinking && !listening && !draft.trim() && (
        <p className="rounded-[12px] border border-spark-amber/40 bg-spark-amber-tint px-3.5 py-2.5 text-[15px] font-semibold leading-snug text-spark-ink">
          I still need {missing}. Say it or type it, then press Send.
        </p>
      )}
      </div>

      {/* The wake word, said only once saying it would do something.
          It used to sit here permanently, from the moment the page loaded --
          so the first thing you were told was how to fire a render of a brief
          that had no town and no subject yet. Now it appears when the brief is
          actually complete, and says what it will do. */}
      {briefReady && !listening && !thinking && !draft.trim() && (sparking || (!off && !settled)) && (
        sparking ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-[10px] border border-spark-blue/25 bg-spark-blue/10 px-3.5 py-2.5 text-[14px] text-spark-ink">
            <CheckCircle size={15} className="flex-none text-spark-blue" />
            <span className="font-medium">I have everything. Writing it now, about a minute.</span>
          </div>
        ) : (
          /* Complete, and not yet told what to make: sent with Enter before
             any button, or said on the home screen without saying which. The
             same three, and a tap starts it. This used to say only "That's
             everything I need", which was true and did not say what to do. */
          <div className="rounded-[12px] border border-spark-blue/25 bg-spark-blue/10 px-3.5 py-3">
            <p className="flex items-center gap-2 text-[15px] font-semibold leading-snug text-spark-ink">
              <CheckCircle size={15} className="flex-none text-spark-blue" />
              I have everything. What should I make?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(picker && selected ? MAKES.filter((m) => m.kind === selected) : MAKES).map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => chooseAndGo(kind)}
                  disabled={disabled}
                  className="rounded-full bg-spark-blue px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-spark-blue-deep disabled:cursor-not-allowed disabled:bg-spark-rule-dim"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
}
