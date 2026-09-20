"use client";

import { VoiceUploader, isVideoFile } from "@/components/voice/voice-uploader";
import { extractSpeechWav, ClipAudioUnavailable } from "@/lib/utils/clip-audio";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import {
  Mic, ArrowRight, CheckCircle, Loader2, FileText,
  Building2, Video, Square, Pause, AlertCircle,
  ChevronDown, Sparkles,
  Plus, X, Paperclip, ImageIcon, Globe,
} from "lucide-react";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { ClipBrander } from "@/components/video/clip-brander";
import { ArticleSource, MediaAndDocs, type DocMode } from "@/components/create/media-and-docs";
import type { PickedEmailArticle } from "@/components/create/email-import-picker";
import { resolveCta } from "@/lib/utils/default-cta";
import { ScriptLengthPicker } from "@/components/create/script-length-picker";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { ListingVideoForm } from "@/components/create/listing-video-form";
import { PhotoReelForm } from "@/components/create/photo-reel-form";
import { SparkPanel } from "@/components/create/spark-panel";
import {
  TEMPLATE_COUNT,
  substitutePlaceholders,
} from "@/components/create/content-templates";
import { VoiceBriefSession } from "@/components/create/voice-brief-session";
// The hero mic listens with the same recogniser as the brief panel and every
// field mic. A second implementation is how one of them ends up lagging.
import { useSpeechRecognition } from "@/lib/hooks/use-speech-recognition";
import { usePublishCreateProgress } from "@/components/layout/create-progress";
import { ComposerCard } from "@/components/create/composer-card";
import { StepFooter } from "@/components/create/step-footer";
import { uploadVideoPhoto } from "@/lib/utils/upload-photo";
import { toStateAbbr } from "@/lib/utils/us-states";
import {
  RENDERED_SCRIPT_LENGTHS,
  ceilMinutesFor,
  LONG_MAX_WORDS,
  minutesFor,
  standardMaxWords,
  type CameraLength,
  type RenderedScriptLength,
} from "@/lib/utils/video-length";

/** Pasted scripts are measured against both caps — the length is picked later. */
const SHORT_MAX_WORDS = standardMaxWords();

/**
 * Copies photos scraped off a listing page into our own storage so the camera
 * recorder can composite them. Best effort — on any failure the originals come
 * back, which still work everywhere except the recording canvas.
 */
async function rehostPhotos(urls: string[]): Promise<string[]> {
  try {
    const res = await fetch("/api/photos/rehost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const body = await safeJson(res);
    const out = Array.isArray(body.urls) ? (body.urls as string[]) : null;
    return out && out.length === urls.length ? out : urls;
  } catch {
    return urls;
  }
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text || text.trimStart().startsWith("<")) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

type Step = "input" | "uploading" | "transcribing" | "done";
// One mode per tab. "content" used to be a fifth, a merged tab that showed a
// chooser routing into "paste" or "listing" — those two are their own tabs
// now, so the mode that only existed to hold them is gone.
type InputMode = "script" | "camera" | "listing" | "paste";

// Shown one at a time above the composer while the topic is still blank, to
// answer "what am I supposed to say into this" without a paragraph of help
// text. Kept market-agnostic: the page has no city yet when these are on
// screen, so a line naming one would be wrong more often than right.
// Whole spoken sentences, not topic fragments. These double as the typed
// field's placeholder, and a three-word example there taught people to type
// three words and stop — leaving the market, audience and tone to be asked
// for separately when they could have said it all in one breath.
/** The common ones, offered first. Anything else you say joins them. */
/**
 * Audiences named by their tension, not their segment.
 *
 * "Buyers" is a category; it tells the writer nothing it did not already
 * assume. "Move-up (keeping a low rate)" is a conflict, and a conflict is what
 * makes a script argue rather than describe — the same reason the strongest
 * blog headings are questions rather than labels.
 *
 * The old segment names still resolve in AUDIENCE_SCRIPT_GUIDANCE, so projects
 * written before this keep the guidance they were generated with. Anything a
 * user types themselves is honoured too — see audienceClause.
 */
const BASE_AUDIENCES = [
  "Move-up (keeping a low rate)",
  "Downsizing",
  "Relocating in",
  "First-time buyers",
  "Sellers deciding when",
  "Investors",
  "Luxury",
  "Mixed",
];
const AUDIENCE_KEY = "spark_custom_audiences";

const TRY_LINES = [
  "Make a market update for my area. Prices are up, homes are moving fast.",
  "Tell the story of the home I just sold, start to finish.",
  "Show what five hundred thousand actually buys around here.",
  "Three things I'd fix before listing this fall, aimed at sellers.",
  "Answer the commute question everybody keeps asking me.",
  "Explain what today's rates mean for a real monthly payment.",
];

/** One tile in row 2. Both sides of row 1 lead to a row of these and they are
 *  answering the same question — where the words come from — so they are the
 *  same control, not two that happen to look alike. */
/* QUICK_TEMPLATES moved to spark-panel, which is where the chips now render —
   under the panel's title rather than above it in a row of their own. */

/**
 * An amber eyebrow naming the section, and under it the question the controls
 * answer.
 *
 * The screen used to be four unlabelled bands of tiles: you could see what the
 * choices were without ever being told what was being asked. Naming the
 * question is what turns a wall of buttons into a sequence.
 *
 * No circled step numbers, deliberately. The editor already counts five steps
 * and says so, and a second 1-2-3-4 running down this one page would be two
 * numbering systems disagreeing in the same eyeline.
 */
/**
 * The mic the page opens on.
 *
 * The fastest way in was also the least visible: the brief's own mic sits in
 * section 3, below two rows of tiles and, on a phone, below the fold. The
 * Spacebar shortcut that does the same thing app-wide renders nothing at all,
 * so on a touch screen it does not exist.
 *
 * This is one control doing one job: say what you want to make, and the words
 * land in the composer below as an editable draft — the same place a picked
 * template lands, through the same `seed` prop. It does not send the turn, so
 * a misheard street name is a keystroke to fix rather than a brief to redo.
 */
function HeroMic({ onHeard, disabled }: { onHeard: (text: string) => void; disabled: boolean }) {
  const heardRef = useRef(onHeard);
  heardRef.current = onHeard;

  const { listening, interim, transcript, toggle } = useSpeechRecognition({
    // Long window: this is someone describing a video out loud, and a pause to
    // think is not the end of the sentence.
    silenceMs: PROSE_SILENCE_MS,
    disabled,
    onSessionEnd: (text) => {
      if (text.trim()) heardRef.current(text.trim());
    },
  });

  const live = [transcript, interim].filter(Boolean).join(" ");

  return (
    // Left, not centred, and one object rather than four stacked lines. The
    // headline and its two subheads are centred above; a third centred block
    // under them made the top of the page a column of things to read before
    // the first control.
    <div className="mt-5 flex flex-col items-start gap-1.5 text-left">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Speak what you want to Spark"}
        className="group relative flex items-center gap-3 rounded-[26px] border border-spark-rule bg-white py-2.5 pl-2.5 pr-5 text-left shadow-sm transition-colors hover:border-spark-amber disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="relative flex h-11 w-11 flex-none items-center justify-center rounded-full bg-spark-amber transition-colors group-hover:bg-spark-blue">
          {listening && (
            <span className="absolute inset-0 animate-mic-pulse rounded-full bg-spark-amber/30" />
          )}
          <Mic size={19} className="relative text-white" />
        </span>
        {/* Both lines inside the button: what it does, and what you can pack
            into the answer. Outside it they read as page copy competing with
            the subheads above rather than as part of the control. */}
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-tight text-spark-ink">
            {/* The product's own verbs, and the same word the headline above
                ends on: speak, spark, share. */}
            {listening ? "Listening — tap when you're done" : "Speak what you want to Spark"}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-spark-ink-muted">
            {listening
              ? "Topic, town, who it's for — in any order"
              : "Topic, town, who it's for — all at once, or one at a time"}
          </span>
        </span>
      </button>

      {/* What is being heard, while it is being heard. Without this the only
          feedback is a pulsing ring, and there is no way to tell a misheard
          word from a mic that is not picking anything up. */}
      {listening && (
        <p className="min-h-[1.4em] max-w-xl text-[14px] leading-[1.45] text-spark-ink-muted">
          {live || "Go ahead…"}
        </p>
      )}
    </div>
  );
}

function SectionHead({ eyebrow, question, aside, className = "" }: {
  eyebrow: string; question: string;
  /** Runs on the same line as the question, in muted type. For the one thing
   *  worth saying beside it — on Topic details, that there is a list below so
   *  nobody has to invent something in front of an empty box. On its own line
   *  it read as a second heading; inline it reads as an aside. */
  aside?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[3px] ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-spark-amber">
        {eyebrow}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2.5 text-[17px] font-semibold leading-[1.2] tracking-[-0.01em] text-spark-ink">
        {question}
        {aside && (
          <span className="text-[13.5px] font-normal leading-[1.35] text-spark-ink-muted">
            {aside}
          </span>
        )}
      </p>
    </div>
  );
}

/** Free or not, said on the control that decides it rather than three steps
 *  later. Amber is the app's "this spends something" colour throughout; free
 *  routes get the quiet neutral, so the pair reads at a glance without either
 *  one shouting.
 *
 *  `emphasis` overrides that on row 1, where all three pills are set in amber
 *  regardless of cost. There the pills sit in a line across three tiles and
 *  are read together — one lit and two greyed made the free routes look like
 *  the lesser options rather than the cheaper ones. Row 2 keeps the default,
 *  where a lone "Free" or "Photo reel free" appears against tiles that carry
 *  no pill at all and amber would wrongly signal a cost. */
function CostPill(
  { free, emphasis = false, children }:
  { free: boolean; emphasis?: boolean; children: React.ReactNode },
) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.1em] ${
        emphasis || !free
          ? "bg-spark-amber-tint text-[#A3660F]"
          : "bg-spark-rule/50 text-spark-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

function SourceTile({
  kicker, label, desc, active, onClick, disabled = false, cost,
}: {
  kicker: string; label: string; desc: string; active: boolean; onClick: () => void;
  /** Still readable, no longer changeable — see cameraSourceLocked. */
  disabled?: boolean;
  /** Only where this tile changes what the route costs. Row 1 answers it for
   *  most tiles already, so repeating "free" on all four camera sources would
   *  be noise — the photo reel is the one that differs from its row. */
  cost?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-h-[74px] flex-col justify-center gap-0.5 rounded-[14px] px-3.5 py-2.5 text-left transition-colors ${
        disabled ? "cursor-default" : ""
      } ${
        active
          ? "border-[1.5px] border-spark-amber bg-white"
          : `border-[1.5px] border-spark-rule bg-white/60 ${disabled ? "" : "hover:border-spark-rule-dim"}`
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${
            active ? "text-[#A3660F]" : "text-spark-ink-faint"
          }`}
        >
          {kicker}
        </span>
        {cost}
      </span>
      <span className="text-[15.5px] font-semibold leading-[1.15] text-spark-ink">{label}</span>
      <span className="text-[12.5px] leading-[1.25] text-spark-ink-muted">{desc}</span>
    </button>
  );
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [inputMode, setInputMode] = useState<InputMode>("script");
  // Which of the render-it-for-me tabs you were last on. Row 1 asks whether
  // you film it or we make it; three of the four tabs live on the "we make
  // it" side, so that tile has to put you back where you were rather than
  // always resetting to the first one.
  const [lastSparkTab, setLastSparkTab] = useState<InputMode>("script");
  /**
   * Words only — no video at the end of it.
   *
   * The article was already being written, free, at the moment the script was:
   * generate-location-script returns blog_intro/body/conclusion with every
   * script and charges nothing for any of it. It was simply unreachable. The
   * Share Kit is editor step 5, step 5 only opened from step 4, and step 4
   * only opened by rendering — so the only door to a finished blog was
   * spending a video to read it.
   *
   * This mode changes the destination, not the writing: same brief, same
   * script call, and it lands on the Share Kit instead of the setup step.
   */
  const [blogOnly, setBlogOnly] = useState(false);
  // The MLS unbranded cut, handed over from the editor's checkbox. Seeds the
  // recorder and is sent to the script writers, which are told to leave the
  // spoken call to action out — the half of "unbranded" that is not overlays.
  const [cameraUnbranded, setCameraUnbranded] = useState(false);
  /**
   * What is left to spend, read on mount.
   *
   * /api/profile/allowance exists for exactly this — its own docstring says
   * "lets the create screen say you're out BEFORE someone fills in a topic" —
   * and nothing called it. A zero balance was discovered at Generate, after
   * the market, the topic, the recording and the style had all been chosen.
   */
  const [allowance, setAllowance] = useState<{ short: number; long: number; unlimited: boolean; trialLocked: boolean } | null>(null);
  const [step, setStep] = useState<Step>("input");
  const [transcript, setTranscript] = useState("");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  // null until the profile loads — avoids flashing the voice prompt at users
  // who do have a clone.
  const [hasVoiceClone, setHasVoiceClone] = useState<boolean | null>(null);

  // Location
  /**
   * The two things this tab makes from the same set of property pictures: a
   * scripted tour that renders with an avatar or a voice, and a reel built
   * straight out of the photos. They share a tab because they share an input.
   */
  const [listingMode, setListingMode] = useState<"listing" | "reel">("listing");
  /**
   * The listing's photos and address, lifted out of ListingVideoForm so the
   * Photo reel under the same tab can start from them. Held here rather than
   * in either form because the two are siblings and only one is mounted at a
   * time — the state has to outlive the switch between them.
   */
  /** Live dictation text, shown greyed under the script box while speaking. */
  const [pasteInterim, setPasteInterim] = useState("");
  const [listingPhotos, setListingPhotos] = useState<string[]>([]);
  const [listingAddress, setListingAddress] = useState("");
  const [locCity, setLocCity] = useState("");
  const [locState, setLocState] = useState("");
  const [profileHomeState, setProfileHomeState] = useState("");
  const [savedMarkets, setSavedMarkets] = useState<{ city: string; state: string }[]>([]);

  // Topic
  const [locCustomTopic, setLocCustomTopic] = useState("");

  // Advanced options
  const [locAudience, setLocAudience] = useState("");
  // Audiences this user has used that are not one of the common six.
  const [customAudiences, setCustomAudiences] = useState<string[]>([]);
  // A topic picked from the spark panel, on its way into the composer box.
  const [sparkSeed, setSparkSeed] = useState({ text: "", n: 0 });
  const [locTone, setLocTone] = useState("");
  const [locCta, setLocCta] = useState("");
  /**
   * Why this video exists — the one thing the brief never asked.
   *
   * It collected what it is about, who it is for, how it should sound and how
   * long it runs, then wrote every script as though the purpose were always
   * the same. "Win the appointment" and "still be the person they remember in
   * six months" produce genuinely different scripts from one topic, and the
   * CTA dropdown is not this: that is the ask at the end, not the reason.
   */
  const [locPurpose, setLocPurpose] = useState("");
  // Chosen BEFORE generating: the script has to be written to length, or a
  // "long" video ends up with a 2-minute script.
  const [locLength, setLocLength] = useState<"standard" | "long">("standard");
  // Reel or YouTube, asked here rather than in the editor. It is one of the
  // four things the composer's chips prompt you to say, and a chip cannot
  // prompt for something this step has no way to answer.
  const [locPlatform, setLocPlatform] = useState<"reel" | "youtube">("youtube");
  // Whether the format was actually chosen, as opposed to left on its default.
  // Only the chip cares — the value is valid either way.
  const [formatTouched, setFormatTouched] = useState(false);
  // Length for AI-written teleprompter scripts (camera + paste flows). Camera
  // recordings are free and run up to 15 min, so this is the agent's choice.
  const [cameraScriptLength, setCameraScriptLength] = useState<CameraLength>("standard");
  // Separate from the camera length above. The two tabs answer to different
  // ceilings — the teleprompter to the 15-minute recording cap, this one to
  // what HeyGen will actually render — and they were sharing one value, so a
  // length picked for a recording silently set the length of a paid render.
  const [pasteScriptLength, setPasteScriptLength] = useState<RenderedScriptLength>("rendered_short");
  /**
   * Whose words go in the box.
   *
   * This tab's promise is that the avatar speaks your script exactly as
   * written, and the first thing on it was a panel offering to write one for
   * you — the AI-writes-it tab in miniature, at the top of the tab that exists
   * not to do that. Defaults to your own words, which is what the tab is for;
   * the AI draft is still here, one click away, for a starting point to edit.
   */
  const [pasteSource, setPasteSource] = useState<"own" | "ai" | "blog">("own");

  const [locGenerating, setLocGenerating] = useState(false);

  // Paste-script tab
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteScript, setPasteScript] = useState("");
  /** Cutting a script down to what the renderer will actually speak. */
  const [pasteShortening, setPasteShortening] = useState(false);
  /** The cap the pasted script is actually measured against — the length picked above. */
  const pasteIsLong = pasteScriptLength === "rendered_long";
  const pasteWordCap = pasteIsLong ? LONG_MAX_WORDS : SHORT_MAX_WORDS;
  /**
   * The closing ask, and what it costs.
   *
   * It is appended to the narration at render time and counted against the
   * same cap, so a script written right up to the limit loses its last
   * sentences to make room — silently, after the video is made. The fields are
   * the ones resolveCta fills; the count is only as true as the CTA is on the
   * day, since it can still be edited on the setup step.
   */
  const [ctaProfile, setCtaProfile] = useState<{
    full_name: string | null; company_name: string | null;
    location_city: string | null; location_state: string | null;
    default_cta: string | null; market_years: string | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, company_name, location_city, location_state, default_cta, market_years")
          .eq("id", user.id)
          .single();
        if (data) setCtaProfile(data as typeof ctaProfile);
      } catch { /* the budget note simply stays hidden */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Source material to summarise — a blog post, an article, notes. */
  const [pasteBlogText, setPasteBlogText] = useState("");
  const [pasteBlogGenerating, setPasteBlogGenerating] = useState(false);
  /**
   * Words produced by the last successful summarise, or null.
   *
   * The confirmation used to be "there is text in the script box", which is
   * true the moment anything is pasted — so it congratulated you on a summary
   * that had never run.
   */
  const [pasteSummarised, setPasteSummarised] = useState<number | null>(null);
  const [pasteHook, setPasteHook] = useState("");
  const [pasteCity, setPasteCity] = useState("");
  const [pasteState, setPasteState] = useState("");
  const [pasteGenerating, setPasteGenerating] = useState(false);
  const [pasteAiTopic, setPasteAiTopic] = useState("");
  const [pasteAiGenerating, setPasteAiGenerating] = useState(false);

  /**
   * The closing ask, and what it costs the script.
   *
   * Declared here rather than beside the other paste derivations because it
   * reads pasteCity/pasteState, which are set below them.
   */
  const pasteCtaWords = (() => {
    if (!ctaProfile) return 0;
    const resolved = resolveCta(ctaProfile.default_cta, {
      city: pasteCity.trim() || ctaProfile.location_city,
      state: pasteState.trim() || ctaProfile.location_state,
      name: ctaProfile.full_name,
      company: ctaProfile.company_name,
      years: ctaProfile.market_years,
    });
    return resolved.trim() ? resolved.trim().split(/\s+/).length : 0;
  })();
  /**
   * What is actually left for the script itself.
   *
   * The full allowance. A pasted script renders on Direct Video, where the
   * script is its own field rather than part of a prompt, so the closing ask
   * extends the video instead of displacing the words you wrote — see
   * ctaOnTop in create-blog. Subtracting it here told you to cut a script to
   * make room for something you could not edit on this screen.
   */
  const pasteScriptBudget = pasteWordCap;

  /**
   * The brief box is holding words that have not been sent.
   *
   * Reported up by the panel, because nothing on this page can see it: the
   * topic only reaches locCustomTopic once a turn has round-tripped, so a
   * typed-but-unsent topic left the footer telling you to supply the thing
   * sitting visible in the box above it.
   */
  const [briefHasDraft, setBriefHasDraft] = useState(false);

  /**
   * Source material for the article writer — a forwarded email, a PDF, a link.
   *
   * Separate from the paste tab's attachment even though both end up as text:
   * this one is read by the article writer on the blog route, where there is no
   * script and no photo b-roll, and mixing them would mean one Clear button
   * emptying an attachment on a screen the user is not looking at.
   */
  // Opens on Paste text: it is the one of the four that needs nothing set up,
  // and seeing a box rather than three buttons says what the panel is for.
  const [blogSrcMode, setBlogSrcMode] = useState<DocMode>("text");
  const [blogSrcText, setBlogSrcText] = useState("");
  const [blogSrcName, setBlogSrcName] = useState("");
  const [blogSrcUrlInput, setBlogSrcUrlInput] = useState("");
  const [blogSrcUploading, setBlogSrcUploading] = useState(false);
  const [blogSrcFetching, setBlogSrcFetching] = useState(false);

  // Paste tab uploads
  const [pastePhotos, setPastePhotos] = useState<{ url: string; name: string; preview: string }[]>([]);
  const [pastePhotoUploading, setPastePhotoUploading] = useState(false);
  const [pastePdfUploading, setPastePdfUploading] = useState(false);
  const [pastePdfText, setPastePdfText] = useState("");
  const [pastePdfUrl, setPastePdfUrl] = useState("");
  const [pastePdfName, setPastePdfName] = useState("");
  const [pastePdfMode, setPastePdfMode] = useState<DocMode>("upload");
  const [pastePdfUrlInput, setPastePdfUrlInput] = useState("");
  const [pastePdfUrlExtracting, setPastePdfUrlExtracting] = useState(false);

  // Camera tab uploads
  const [cameraPhotos, setCameraPhotos] = useState<{ url: string; name: string; preview: string }[]>([]);
  const [cameraPhotoUploading, setCameraPhotoUploading] = useState(false);
  /**
   * Which phase CameraRecorder is in.
   *
   * Its setup — the spoken brief, the market field, the photos and the doc
   * attach — is rendered by this page, above the recorder. So once the camera
   * opened, and again once a take was recorded and playing, every one of those
   * inputs was still sitting on screen above the result: the doc/URL attach
   * appearing "again" underneath a finished video. They fold away while the
   * camera has the screen and come back if the take is discarded.
   */
  const [cameraPhase, setCameraPhase] = useState<"script" | "camera" | "done">("script");
  /**
   * Where this tab's script comes from.
   *
   * There were four ways to get one and no hierarchy between them: a mic at
   * the top of the card, a "write from these" button inside the uploads box, a
   * "Spark with AI" link on the script itself, and — below Open Camera, past a
   * tips list, at the very bottom of nine sections — an audio drop zone that
   * transcribes a recording you already made. That last one is a script
   * source like the rest, and it was the least findable thing on the page.
   *
   * Asked once, up front, the way the listings tab asks how to get the
   * details in. Photos are not in the list: they are b-roll, not a script,
   * and stay available whichever way in you pick.
   */
  const [cameraSource, setCameraSource] = useState<"speak" | "uploads" | "audio" | "own" | "freestyle">("speak");
  /**
   * Record here, or brand a clip already shot.
   *
   * Branding an existing clip re-records it in real time from a foreground
   * tab, which a phone cannot do — the screen locks, the tab suspends, and the
   * file comes out short. So the option is only offered on a pointer device
   * with a wide viewport, and recording in the app stays the answer everywhere
   * else. Checked after mount because there is no window on the server.
   */
  const [cameraMode, setCameraMode] = useState<"record" | "brand">("record");
  const [canBrandClips, setCanBrandClips] = useState(false);
  useEffect(() => {
    const desktop =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      window.innerWidth >= 900;
    setCanBrandClips(desktop);
  }, []);
  const [cameraPdfUploading, setCameraPdfUploading] = useState(false);
  const [cameraPdfText, setCameraPdfText] = useState("");
  const [cameraPdfUrl, setCameraPdfUrl] = useState("");
  const [cameraPdfName, setCameraPdfName] = useState("");
  const [cameraPdfMode, setCameraPdfMode] = useState<DocMode>("upload");
  const [cameraPdfUrlInput, setCameraPdfUrlInput] = useState("");
  const [cameraPdfUrlExtracting, setCameraPdfUrlExtracting] = useState(false);
  const [cameraGeneratedScript, setCameraGeneratedScript] = useState("");
  const [cameraScriptGenerating, setCameraScriptGenerating] = useState(false);
  // The camera tab had no topic field at all — its only AI path was "write
  // from my uploads". The spoken brief supplies one.
  const [cameraVoiceTopic, setCameraVoiceTopic] = useState("");

  // Paste tab upload-based script generation
  const [pasteUploadGenerating, setPasteUploadGenerating] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUDIENCE_KEY) ?? "[]");
      if (Array.isArray(saved)) setCustomAudiences(saved.filter((a) => typeof a === "string"));
    } catch { /* private mode, or a corrupt entry. The six defaults still work */ }
  }, []);

  useEffect(() => {
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAllowance({ short: d.short ?? 0, long: d.long ?? 0, unlimited: !!d.unlimited, trialLocked: !!d.trialLocked }); })
      .catch(() => { /* the screen still works; it just cannot warn early */ });
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const topic = searchParams.get("topic");
    const urlCity = searchParams.get("city");
    const urlState = searchParams.get("state");

    // ?tab= now reaches every tab. "paste" had no route in while it was a
    // sub-flow, so a link could land you on the parent and leave you to find
    // the toggle; there is no parent any more.
    if (tab === "camera") setInputMode("camera");
    else if (tab === "listing") { setInputMode("listing"); setLastSparkTab("listing"); }
    else if (tab === "paste" || tab === "script") { setInputMode(tab); setLastSparkTab(tab); }
    if (topic) { setLocCustomTopic(topic); setInputMode("script"); setLastSparkTab("script"); }

    // Handed off from the editor's "Record on Camera" button — the hook,
    // script and CTA it already generated, pre-filling the teleprompter
    // instead of the user copying each field over by hand.
    try {
      const handoff = sessionStorage.getItem("camera-record-script");
      if (handoff) {
        setCameraGeneratedScript(handoff);
        sessionStorage.removeItem("camera-record-script");
        // A script that arrived already written is not one we are about to
        // write. Left on "speak", the tab lit up "AI writes it · Say a topic"
        // and put a live voice-brief mic above a full teleprompter.
        setCameraSource("own");
      }
      // The MLS unbranded choice, made in the editor and read here.
      const unbrandedHandoff = sessionStorage.getItem("camera-record-unbranded");
      if (unbrandedHandoff !== null) {
        setCameraUnbranded(unbrandedHandoff === "1");
        sessionStorage.removeItem("camera-record-unbranded");
      }
      /**
       * The editor's photos, handed over with the script.
       *
       * Without this the editor's "I'll record it" and the listing form's
       * "Read it myself on camera" landed in the same recorder with different
       * results: one arrived with your twelve photos as b-roll, the other with
       * none, and nothing on either screen said so. They read as one choice
       * and now behave as one.
       *
       * Rehosted before use, like every other path into this recorder: a
       * canvas cannot record a third-party image, so a scraped photo has to be
       * copied into our storage first or the recording fails outright.
       */
      const photoHandoff = sessionStorage.getItem("camera-record-photos");
      if (photoHandoff) {
        sessionStorage.removeItem("camera-record-photos");
        const urls = (JSON.parse(photoHandoff) as unknown[]).filter(
          (u): u is string => typeof u === "string" && u.startsWith("http"),
        );
        if (urls.length) {
          void rehostPhotos(urls.slice(0, 12)).then((safe) =>
            setCameraPhotos(
              safe.map((url, i) => ({ url, name: `Photo ${i + 1}`, preview: url })),
            ),
          );
        }
      }
    } catch { /* sessionStorage unavailable or bad JSON */ }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase
        .from("profiles")
        .select("location_city, location_state, saved_markets, onboarding_done, heygen_voice_id")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          /**
           * The market is NOT seeded from Settings any more.
           *
           * Pre-filling it with the profile's home town meant the commonest
           * outcome was a video about a house in one place captioned with
           * another — the field looked answered, so nobody looked at it. It
           * starts empty and is required, so the answer is always this video's
           * answer. A ?city= in the URL still fills it, because that came from
           * a deliberate choice somewhere else in the app.
           *
           * profileHomeState is still read: it only backfills the two-letter
           * state once a city has been typed, which saves a keystroke without
           * ever naming a town for you.
           */
          if (data?.location_state) setProfileHomeState(data.location_state);
          if (urlCity) setLocCity(urlCity);
          if (urlState) setLocState(urlState);
          if (Array.isArray(data?.saved_markets)) {
            // Drop any malformed entries (null/missing city or state) so render-time
            // string ops like m.city.toLowerCase() can never throw and crash the page.
            const clean = (data.saved_markets as unknown[])
              .filter((m): m is { city: string; state: string } =>
                !!m && typeof (m as { city?: unknown }).city === "string" && typeof (m as { state?: unknown }).state === "string")
              .map((m) => ({ city: m.city, state: m.state }));
            setSavedMarkets(clean);
          }
          setOnboardingDone(!!(data as { onboarding_done?: boolean } | null)?.onboarding_done);
          setHasVoiceClone(!!(data as { heygen_voice_id?: string | null } | null)?.heygen_voice_id);
        });
    });
  }, []); // eslint-disable-line

  // State always fills in alongside the city: a saved-market match wins,
  // otherwise the profile's home state backfills an empty state field so the
  // user never has to type it separately.
  useEffect(() => {
    const c = locCity.trim().toLowerCase();
    if (!c) return;
    const match = savedMarkets.find((m) => (m.city ?? "").toLowerCase() === c);
    if (match?.state) { setLocState(match.state); return; }
    if (!locState.trim() && profileHomeState) setLocState(profileHomeState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locCity, savedMarkets, profileHomeState]);

  async function processAudio(blob: Blob, durationSeconds: number, title = "New Recording") {
    setStep("uploading");
    try {
      const formData = new FormData();
      // The extension decides how the file is stored and what it is served
      // back as, so it has to match what the blob actually is. WAV arriving
      // here named .webm was stored as a WebM and handed to transcription as
      // one — it worked only because the decoder sniffs the bytes anyway.
      const ext = blob.type.includes("wav") ? "wav"
        : blob.type.includes("mpeg") || blob.type.includes("mp3") ? "mp3"
        : blob.type.includes("mp4") ? "mp4"
        : "webm";
      formData.append("audio", blob, `recording.${ext}`);
      formData.append("title", title);
      formData.append("duration", String(durationSeconds));

      const uploadRes = await fetch("/api/voice/upload", { method: "POST", body: formData });
      const uploadBody = await safeJson(uploadRes);
      if (!uploadRes.ok) throw new Error((uploadBody.error as string) || `Upload failed (${uploadRes.status})`);
      const { recording, signedUrl } = uploadBody as { recording: { id: string }; signedUrl: string };
      setRecordingId(recording.id);
      setStep("transcribing");

      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recording.id, signedUrl }),
      });
      const transcribeBody = await safeJson(transcribeRes);
      if (!transcribeRes.ok) throw new Error((transcribeBody.error as string) || `Transcription failed (${transcribeRes.status})`);
      setTranscript((transcribeBody as { transcript: string }).transcript);
      setStep("done");
      toast.success("Voice transcribed! Review and generate your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  }

  function handleFileSelected(file: File) { setUploadedFile(file); }

  async function handleContinue() {
    if (!uploadedFile) return;
    const title = uploadedFile.name.replace(/\.[^/.]+$/, "");

    // A video is reduced to its speech before it goes anywhere.
    //
    // Only the words are wanted here — the footage is discarded either way —
    // so uploading the video itself would be sending hundreds of megabytes to
    // have a couple of minutes of talking read out of it. Decoding in the
    // browser turns that into a few megabytes of 16 kHz mono, which is why
    // video can be allowed at all: the request body limit that caps audio at
    // 50 MB never comes near it.
    if (isVideoFile(uploadedFile)) {
      setStep("uploading");
      try {
        const speech = await extractSpeechWav(uploadedFile);
        await processAudio(speech, 0, title);
      } catch (err) {
        toast.error(
          err instanceof ClipAudioUnavailable
            ? `${err.message} Try exporting it as an audio file instead.`
            : err instanceof Error ? err.message : "Could not read that video's audio",
        );
        setStep("input");
      }
      return;
    }

    await processAudio(uploadedFile, 0, title);
  }

  async function handleCameraPhotosUpload(files: FileList) {
    const remaining = 12 - cameraPhotos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setCameraPhotoUploading(true);
    try {
      const results = await Promise.all(
        toUpload.map(async (file) => {
          const { url, name } = await uploadVideoPhoto(file);
          return { url, name, preview: url };
        })
      );
      setCameraPhotos((prev) => [...prev, ...results].slice(0, 12));
      toast.success(`${results.length} photo${results.length > 1 ? "s" : ""} uploaded!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setCameraPhotoUploading(false);
    }
  }

  function removeCameraPhoto(index: number) {
    setCameraPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCameraPdfUpload(file: File) {
    setCameraPdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to extract PDF");
      setCameraPdfText(body.text as string);
      setCameraPdfUrl(body.url as string);
      setCameraPdfName(body.name as string);
      toast.success("PDF attached and content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setCameraPdfUploading(false);
    }
  }

  async function handleGenerateVideo() {
    if (!recordingId) return;
    if (cameraPhotos.length > 0 || cameraPdfUrl) {
      try {
        sessionStorage.setItem("camera-uploads", JSON.stringify({
          photos: cameraPhotos.map((p) => ({ url: p.url, name: p.name, preview: p.url })),
          pdfText: cameraPdfText,
          pdfUrl: cameraPdfUrl,
          pdfName: cameraPdfName,
        }));
      } catch { /* sessionStorage unavailable */ }
    }
    // The market travels with the recording. The field above says it sets the
    // channel CTA and the end card, but this route never sent it and the
    // script API fell back to the profile's home city — a Willow Grove
    // listing went out saying Blue Bell.
    const marketQs = locCity.trim() && locState.trim()
      ? `&city=${encodeURIComponent(locCity.trim())}&state=${encodeURIComponent(locState.trim())}`
      : "";
    router.push(`/create/${recordingId}?source=recording${marketQs}`);
  }

  async function persistMarkets(markets: { city: string; state: string }[]) {
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ saved_markets: markets }).eq("id", userId);
  }

  function addMarket(city: string, state: string) {
    const c = city.trim(), s = state.trim().toUpperCase();
    if (!c || !s) return;
    if (savedMarkets.some(m => (m.city ?? "").toLowerCase() === c.toLowerCase() && (m.state ?? "").toUpperCase() === s)) return;
    const updated = [...savedMarkets, { city: c, state: s }];
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  /**
   * Remembers an audience that is not one of the common six, so "people
   * relocating" is in the picker next time rather than something you have to
   * say again. Local, not on the profile: it is a convenience for this
   * browser, and nothing else reads it.
   */
  function rememberAudience(raw: string) {
    const a = raw.trim();
    if (!a) return;
    const known = [...BASE_AUDIENCES, ...customAudiences];
    if (known.some((k) => k.toLowerCase() === a.toLowerCase())) return;
    const updated = [...customAudiences, a].slice(-12);
    setCustomAudiences(updated);
    try { localStorage.setItem(AUDIENCE_KEY, JSON.stringify(updated)); } catch { /* private mode */ }
  }

  function removeMarket(city: string, state: string) {
    const updated = savedMarkets.filter(m => !(m.city === city && m.state === state));
    setSavedMarkets(updated);
    persistMarkets(updated);
  }

  /**
   * `spoken` carries values straight from the voice session. Its onReady and
   * onSlots fire in the same tick, so anything read back from React state
   * here would be a render behind — and one utterance carrying the whole
   * brief plus the wake word is exactly when that state is still empty.
   */
  async function handleGenerateScript(spoken?: { city?: string | null; state?: string | null; topic?: string | null }) {
    const city = (spoken?.city ?? locCity).trim();
    const state = (spoken?.state ?? locState).trim();
    const attached = blogOnly ? blogSrcText.trim() : "";
    // An attached article stands in for a typed topic — its own subject is
    // what the piece is about. Falls back to the file or page name, and then to
    // a plain description, because the writer needs a subject line either way.
    const topic = (spoken?.topic ?? locCustomTopic).trim()
      || (attached ? (blogSrcName.trim() || "the attached article") : "");
    // No market gate any more — the topic carries its own location, and the
    // saved market is only a fallback for topics that name no place.
    if (!topic) {
      return toast.error("Please enter or pick a topic");
    }
    if (city && state) addMarket(city, state);
    setLocGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-location-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoType: "custom",
          // A fallback only. If the topic names a place, that place wins —
          // see buildCustomRequest in lib/api/perplexity-prompts.ts.
          city,
          state,
          // A template picked before the location was filled says "your city".
          // Re-resolving here means the order the two were done in stops
          // mattering.
          customTopic: (topicTemplateRaw
            ? substitutePlaceholders(topicTemplateRaw, city, state)
            : topic
          ).trim(),
          // What the agent brought with them, when they brought something. The
          // writer covers its ground in their voice rather than copying it —
          // see buildCustomRequest for the rules it is handed with.
          // Their own draft is edited and expanded; someone else's piece is
          // covered and rewritten. The writer is told which it is.
          ...(attached && { sourceText: attached, sourceIsOwn: blogSrcMode === "text" }),
          audience: locAudience || undefined,
          tone: locTone || undefined,
          ctaPreference: locCta || undefined,
          purpose: locPurpose || undefined,
          videoLength: locLength,
          videoPlatform: locPlatform,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Script generation failed (${res.status})`);
      // The article comes back with the script, in the same call, for the same
      // nothing — so the blog route has no more work to do and goes straight
      // to the Share Kit rather than through a setup step for a video nobody
      // asked for. The project is saved either way and shows in My Content
      // under Drafts, so the article is findable again later.
      const projectId = (data.project as { id: string }).id;
      toast.success(blogOnly ? "Your article is ready." : "Sparked. Your script is ready to review.");
      router.push(`/create/${projectId}?source=location${blogOnly ? "&step=5" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLocGenerating(false);
    }
  }

  /** Move a photo within one of the {url,name,preview} arrays. */
  function reorder<T>(list: T[], from: number, to: number): T[] {
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  }

  async function handlePastePhotosUpload(files: FileList) {
    const remaining = 12 - pastePhotos.length;
    if (remaining <= 0) return;
    const toUpload = Array.from(files).slice(0, remaining);
    setPastePhotoUploading(true);
    try {
      const results = await Promise.all(
        toUpload.map(async (file) => {
          const { url, name } = await uploadVideoPhoto(file);
          return { url, name, preview: url };
        })
      );
      setPastePhotos((prev) => [...prev, ...results].slice(0, 12));
      toast.success(`${results.length} photo${results.length > 1 ? "s" : ""} uploaded!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setPastePhotoUploading(false);
    }
  }

  function removePastePhoto(index: number) {
    setPastePhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handlePastePdfUpload(file: File) {
    setPastePdfUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // The whole article when it is the thing being summarised, rather than the
      // 5,000-character reference-doc extract. Same figure the URL import asks
      // for on this route.
      if (pasteSource === "blog") formData.append("maxChars", "20000");
      const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to extract PDF");
      setPastePdfText(body.text as string);
      // In blog mode the PDF IS the source material, so it fills the box about
      // to be summarised — the same thing fetching a URL does. Without this the
      // PDF attached silently and the box stayed empty.
      if (pasteSource === "blog") setPasteBlogText(body.text as string);
      setPastePdfUrl(body.url as string);
      setPastePdfName(body.name as string);
      toast.success(
        pasteSource === "blog"
          ? "PDF read — its text is in the box below."
          : "PDF attached and content extracted!",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setPastePdfUploading(false);
    }
  }

  /**
   * An article the agent forwarded to their import address.
   *
   * Lands in the same two places the URL import does: the article box in blog
   * mode, where it is the source material about to be summarised, and the
   * attachment slot, where it is background for the AI writer. Its images join
   * the b-roll — they were copied into our own storage when the email arrived,
   * so unlike scraped photos they need no rehosting here.
   */
  function handlePasteEmailPick(article: PickedEmailArticle) {
    setPastePdfText(article.text);
    // Not a real URL — nothing fetches this. It is how the attachment slot
    // knows something is attached, and it names what that something is.
    setPastePdfUrl(`email:${article.id}`);
    setPastePdfName(article.subject);
    if (pasteSource === "blog") setPasteBlogText(article.text);
    if (article.imageUrls.length > 0) {
      setPastePhotos((prev) => {
        const room = 12 - prev.length;
        const add = article.imageUrls.slice(0, room).map((url) => ({ url, name: "From email", preview: url }));
        return [...prev, ...add];
      });
    }
    const withPhotos = article.imageUrls.length > 0
      ? `, ${article.imageUrls.length} image${article.imageUrls.length === 1 ? "" : "s"} attached`
      : "";
    toast.success(`Brought in "${article.subject}" — ${article.words.toLocaleString()} words${withPhotos}.`);
  }

  function handleCameraEmailPick(article: PickedEmailArticle) {
    setCameraPdfText(article.text);
    setCameraPdfUrl(`email:${article.id}`);
    setCameraPdfName(article.subject);
    if (article.imageUrls.length > 0) {
      setCameraPhotos((prev) => {
        const room = 12 - prev.length;
        const add = article.imageUrls.slice(0, room).map((url) => ({ url, name: "From email", preview: url }));
        return [...prev, ...add];
      });
    }
    toast.success(`Brought in "${article.subject}" — ${article.words.toLocaleString()} words.`);
  }

  /**
   * The three ways material reaches the article writer.
   *
   * All three land in the same place — blogSrcText, sent as sourceText when the
   * article is written. The name is what the pill shows, and doubles as the
   * topic when the agent never typed one: a forwarded piece already has a
   * subject line saying what it is about.
   */
  async function handleBlogSrcPdf(file: File) {
    setBlogSrcUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("maxChars", "20000");
      const res = await fetch("/api/ai/extract-pdf", { method: "POST", body: formData });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to extract PDF");
      setBlogSrcText(body.text as string);
      setBlogSrcName(body.name as string);
      toast.success("PDF read — your article will be written from it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process PDF");
    } finally {
      setBlogSrcUploading(false);
    }
  }

  async function handleBlogSrcUrl() {
    if (!blogSrcUrlInput.trim()) return;
    setBlogSrcFetching(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blogSrcUrlInput.trim(), maxChars: 20000 }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to fetch URL");
      setBlogSrcText(body.text as string);
      try { setBlogSrcName(new URL(body.url as string).hostname.replace("www.", "")); } catch { setBlogSrcName("Web page"); }
      toast.success("Page read — your article will be written from it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setBlogSrcFetching(false);
    }
  }

  /**
   * Writing the agent pasted in — a draft, an old post, notes, a script they
   * wrote for something else. The one route where there is no name to show, so
   * the pill says what it is and the topic is left to them: a paste carries no
   * subject line to borrow.
   */
  function handleBlogSrcText(text: string) {
    setBlogSrcText(text);
    const words = text.trim().split(/\s+/).length;
    setBlogSrcName(`Your text · ${words.toLocaleString()} words`);
    toast.success("Saved. Your article will be written from this.");
  }

  function handleBlogSrcEmail(article: PickedEmailArticle) {
    setBlogSrcText(article.text);
    setBlogSrcName(article.subject);
    // The subject becomes the topic when there isn't one, so the brief is
    // complete the moment something is picked. Never overwrites a typed topic.
    if (!locCustomTopic.trim()) {
      setLocCustomTopic(article.subject);
      setTopicTemplateRaw(null);
    }
    toast.success(`"${article.subject}" will be the source for your article.`);
  }

  async function handlePasteUrlExtract() {
    if (!pastePdfUrlInput.trim()) return;
    setPastePdfUrlExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Summarising a whole post needs the whole post. The default 5,000
        // characters is about 800 words, which truncates a normal blog before
        // the summariser ever sees the end of it.
        body: JSON.stringify({
          url: pastePdfUrlInput.trim(),
          ...(pasteSource === "blog" && { maxChars: 20000 }),
        }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to fetch URL");
      setPastePdfText(body.text as string);
      // In blog mode the fetched page IS the source material, so it goes
      // straight into the box you are about to summarise rather than sitting
      // in an attachment you would have to copy out of.
      if (pasteSource === "blog") setPasteBlogText(body.text as string);
      setPastePdfUrl(body.url as string);
      try { setPastePdfName(new URL(body.url as string).hostname.replace("www.", "")); } catch { setPastePdfName("URL"); }
      const found = (Array.isArray(body.photoUrls) ? body.photoUrls as string[] : []);
      if (found.length > 0) {
        // Same reason as the camera tab: these come back on the listing site's
        // domain. Here it's the renderer that has to fetch them rather than a
        // canvas, so hotlink protection or an expired URL costs you the photo
        // silently. Copying them into our own storage removes the dependency.
        const usable = await rehostPhotos(found);
        setPastePhotos((prev) => {
          const room = 12 - prev.length;
          const add = usable.slice(0, room).map((url) => ({ url, name: "From page", preview: url }));
          return [...prev, ...add];
        });
      }
      toast.success(found.length > 0 ? `URL content extracted, ${found.length} photo${found.length > 1 ? "s" : ""} found!` : "URL content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setPastePdfUrlExtracting(false);
    }
  }

  /**
   * Summarise pasted source material into a script of the chosen length.
   *
   * The result lands in the same box you edit by hand, and nothing renders
   * until you press generate — so what you read is what gets spoken.
   */
  async function handleScriptFromBlog() {
    const source = pasteBlogText.trim();
    if (!source) return;
    setPasteBlogGenerating(true);
    try {
      const res = await fetch("/api/ai/script-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The budget, not the raw cap. The closing ask is appended to the
        // narration and counted against the same limit, so summarising to the
        // cap produced a script that was over the moment it arrived — the
        // warning fired on words this button had just written.
        body: JSON.stringify({
          text: source,
          length: pasteScriptLength,
          budget: pasteScriptBudget,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Couldn't turn that into a script");
      setPasteScript(data.script as string);
      // The summariser also returns a question-form headline. Only used when
      // the title field is still empty — a title the user typed themselves is
      // theirs, and overwriting it would undo work they can't see happening.
      const suggested = String(data.title ?? "").trim();
      if (suggested && !pasteTitle.trim()) setPasteTitle(suggested);
      const words = Number(data.words ?? 0);
      setPasteSummarised(words);
      toast.success(`Script ready — ${words.toLocaleString()} words, about ${data.minutes} min. Read it over before you generate.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn that into a script");
    } finally {
      setPasteBlogGenerating(false);
    }
  }

  async function handleCameraUrlExtract() {
    if (!cameraPdfUrlInput.trim()) return;
    setCameraPdfUrlExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cameraPdfUrlInput.trim() }),
      });
      const body = await safeJson(res);
      if (!res.ok) throw new Error((body?.error as string) || "Failed to fetch URL");
      setCameraPdfText(body.text as string);
      setCameraPdfUrl(body.url as string);
      try { setCameraPdfName(new URL(body.url as string).hostname.replace("www.", "")); } catch { setCameraPdfName("URL"); }
      const found = (Array.isArray(body.photoUrls) ? body.photoUrls as string[] : []);
      if (found.length > 0) {
        // Scraped photos live on the listing site's domain, which makes them
        // unusable as b-roll — the recorder cannot draw a cross-origin image
        // without tainting the canvas and breaking the recording outright.
        // Copy them into our own storage first; failures come back unchanged
        // and simply won't appear as b-roll.
        const usable = await rehostPhotos(found);
        setCameraPhotos((prev) => {
          const room = 12 - prev.length;
          const add = usable.slice(0, room).map((url) => ({ url, name: "From page", preview: url }));
          return [...prev, ...add];
        });
      }
      toast.success(found.length > 0 ? `URL content extracted, ${found.length} photo${found.length > 1 ? "s" : ""} found!` : "URL content extracted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch URL");
    } finally {
      setCameraPdfUrlExtracting(false);
    }
  }

  async function handleGenerateScriptFromPasteUploads() {
    setPasteUploadGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Market goes with the request, not just onto the project afterwards.
        // It is asked above the script for exactly this reason — a script that
        // names no town cannot be given one by the CTA alone.
        body: JSON.stringify({
          pdfText: pastePdfText || undefined,
          photoCount: pastePhotos.length,
          length: pasteScriptLength,
          city: pasteCity.trim() || undefined,
          state: pasteState.trim() || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setPasteScript(data.script as string);
      toast.success("Script ready. Review and edit before generating your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setPasteUploadGenerating(false);
    }
  }

  /**
   * Cut a pasted script down to what the renderer will actually speak.
   *
   * Offered only past the long-video maximum, where there is no longer a
   * length to switch to: the render-time clamp stops at a sentence boundary
   * and drops everything after it, so the choice is between cutting on purpose
   * and being cut silently.
   *
   * The script in the box is replaced, and the toast carries an Undo — these
   * are the user's own words, and a rewrite they did not like should cost one
   * click to reverse rather than a retype.
   */
  async function shortenPastedScript() {
    const original = pasteScript;
    setPasteShortening(true);
    try {
      const res = await fetch("/api/ai/shorten-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The budget, not the raw cap — the CTA is appended to the narration
        // and counted against the same limit, so cutting to the cap would
        // still lose the tail once it is added.
        body: JSON.stringify({
          script: original,
          length: pasteScriptLength,
          budget: pasteScriptBudget,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Couldn't shorten the script");
      setPasteScript(data.script as string);
      const removed = Number(data.removed ?? 0);
      toast(
        (t) => (
          <span className="text-sm">
            Shortened by {removed.toLocaleString()} words.{" "}
            <button
              onClick={() => { setPasteScript(original); toast.dismiss(t.id); }}
              className="font-semibold underline"
            >
              Undo
            </button>
          </span>
        ),
        { duration: 10000 },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't shorten the script");
    } finally {
      setPasteShortening(false);
    }
  }

  /**
   * Teleprompter script from a topic the agent spoke, rather than from
   * uploads. Same endpoint — it already accepts either.
   *
   * `spoken` carries the market straight from the voice session for the same
   * reason handleGenerateScript takes it: onSlots and onReady fire in the same
   * tick, so locCity read back from state here would be a render behind.
   */
  async function handleCameraScriptFromTopic(
    topic: string,
    spoken?: { city?: string | null; state?: string | null },
  ) {
    if (!topic.trim()) return;
    const city = (spoken?.city ?? locCity).trim();
    const state = (spoken?.state ?? locState).trim();
    setCameraScriptGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          length: cameraScriptLength,
          city: city || undefined,
          state: state || undefined,
          // Half of "unbranded" is the spoken call to action, and only the
          // script writer can leave that out. The recorder sent this; these
          // two page-level routes did not, so a ticked box suppressed the
          // overlays and still produced a script ending in "give me a call".
          unbranded: cameraUnbranded,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setCameraGeneratedScript(data.script as string);
      toast.success("Script ready. It's loaded in your teleprompter.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setCameraScriptGenerating(false);
    }
  }

  async function handleGenerateScriptFromCameraUploads() {
    setCameraScriptGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfText: cameraPdfText || undefined,
          photoCount: cameraPhotos.length,
          length: cameraScriptLength,
          city: locCity.trim() || undefined,
          state: locState.trim() || undefined,
          unbranded: cameraUnbranded,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed to generate script");
      setCameraGeneratedScript(data.script as string);
      toast.success("Script ready. It's now loaded in your teleprompter below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setCameraScriptGenerating(false);
    }
  }

  async function handlePasteScript() {
    if (!pasteScript.trim()) return toast.error("Please paste or type your script first");
    setPasteGenerating(true);
    try {
      if (pastePhotos.length > 0 || pastePdfUrl) {
        try {
          sessionStorage.setItem("paste-uploads", JSON.stringify({
            photos: pastePhotos.map((p) => ({ url: p.url, name: p.name, preview: p.url })),
            pdfText: pastePdfText,
            pdfUrl: pastePdfUrl,
            pdfName: pastePdfName,
          }));
        } catch { /* sessionStorage unavailable */ }
      }
      const res = await fetch("/api/ai/paste-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: pasteTitle || undefined,
          script: pasteScript,
          hook: pasteHook.trim() || undefined,
          city: pasteCity || undefined,
          state: pasteState || undefined,
          // The length chosen here, carried to the project so the setup step
          // opens on it. Without this the editor always preset Shorts, and a
          // 1,100-word pasted script landed on a 400-word format that would
          // trim it — the choice made on this screen reaching nothing.
          length: pasteScriptLength,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || `Failed (${res.status})`);
      router.push(`/create/${(data.project as { id: string }).id}?source=paste`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPasteGenerating(false);
    }
  }

  async function handleAiWriteForPaste() {
    if (!pasteAiTopic.trim()) return;
    setPasteAiGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: pasteAiTopic,
          length: pasteScriptLength,
          city: pasteCity.trim() || undefined,
          state: pasteState.trim() || undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) || "Failed");
      setPasteScript(data.script as string);
      if (!pasteTitle) setPasteTitle(pasteAiTopic);
      toast.success("Script ready. Review and edit before generating your video.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setPasteAiGenerating(false);
    }
  }


  // The full template browser is collapsed until asked for — the design leads
  // with trending and formats, not all 29 templates at once.
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The unresolved "{city}, {state}" form of a picked template. Kept so that
  // choosing a template before filling the location still ends up with the
  // real place in it rather than a literal "your city".
  const [topicTemplateRaw, setTopicTemplateRaw] = useState<string | null>(null);
  // filter(Boolean) matters: "".split(/\s+/) is [""], which counts as one word
  // and made an empty box read "1 / 500".
  const pasteWordCount = pasteScript.trim().split(/\s+/).filter(Boolean).length;

  function openTemplates() {
    setTemplatesOpen(true);
    // Points at the spark panel, which now holds the full list in its picker —
    // the old expanding browser and its #topic-templates anchor are gone.
    setTimeout(
      () => document.getElementById("spark-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  const readyToContinue = step === "input" && inputMode === "camera" && !!uploadedFile;
  const locationSet = !!(locCity.trim() && locState.trim());
  const isMarketSaved = savedMarkets.some(
    m => (m.city ?? "").toLowerCase() === locCity.trim().toLowerCase() && (m.state ?? "").toUpperCase() === locState.trim().toUpperCase()
  );
  // The two things step 1 actually needs before it can hand over. An attached
  // article counts as the topic: it already says what the piece is about, and
  // asking someone to summarise in a sentence what they just handed over is
  // asking twice.
  const blogSourceReady = blogOnly && !!blogSrcText.trim();
  const canContinue = locationSet && (!!locCustomTopic.trim() || blogSourceReady) && !locGenerating;

  // Feeds the topbar's step chip and gradient rail. Deliberately mode-agnostic:
  // paste, listing and camera all move through the same processing states, and
  // "Step 1" is the page's own existing language for where you are.
  // Every tab writes a script; they just start from different material. The
  // rail read only the AI tab's state before, so it sat at "Step 1 · 10%"
  // through an entire paste or camera brief however much had been filled in.
  const anyGenerating =
    locGenerating || pasteGenerating || pasteUploadGenerating || cameraScriptGenerating;
  const tabReady =
    inputMode === "script" ? canContinue
      : inputMode === "camera" ? readyToContinue || !!cameraVoiceTopic.trim() || !!cameraGeneratedScript.trim()
        : inputMode === "paste" ? !!pasteScript.trim()
          : false;

  const railLabel =
    step === "uploading" ? "Uploading"
      : step === "transcribing" ? "Transcribing"
        : step === "done" ? "Ready"
          : anyGenerating ? "Sparking"
            : "Step 1";
  const railPercent =
    step === "done" ? 100
      : step === "transcribing" ? 75
        : anyGenerating ? 60
          : step === "uploading" ? 50
            : tabReady ? 25
              : 10;
  usePublishCreateProgress(railLabel, railPercent);

  // Row 2 stays on screen once you start recording, or once you switch to
  // branding a clip you already shot — dimmed rather than unmounted. It used
  // to disappear, which was fine when it lived mid-card but moves the whole
  // page now that it sits at the top: everything below jumped up at the exact
  // moment you reached for Open Camera. Dimming also keeps the answer visible
  // while you record, where before there was nothing on screen saying where
  // your script had come from.
  const cameraSourceLocked =
    cameraPhase !== "script" || (cameraMode === "brand" && canBrandClips);

  // Which of the three ways in you are on. Shown on every tab: they are all
  // step 1 of the same five, and only the AI tab said so.
  const tabLabel =
    inputMode === "camera" ? "Film on camera"
      : inputMode === "script" ? "AI writes it"
        : inputMode === "listing" ? "My listings/My photos"
          : "Paste my script";

  /**
   * Out of videos, and said before the work rather than after it.
   *
   * Only for the routes that actually spend one — filming yourself is free,
   * and so is the photo reel, so neither should be warned off.
   */
  /**
   * The article is inside the same 30-day free window as camera recording and
   * the AI Tools — unlocked by generating the free video, then 30 days.
   * Null while the allowance is still loading, so the tile does not flash
   * "locked" at a paying customer on every page load.
   */
  const trialLocked = !!allowance?.trialLocked;

  const outOfVideos = !!allowance && !allowance.unlimited
    && allowance.short === 0 && allowance.long === 0
    && inputMode !== "camera";

  const showActionBar = inputMode === "script" && step === "input";
  // Listings keep their own submit inside ListingVideoForm, which owns that
  // form's validity; the other three tabs put their primary action on the bar.
  const anyActionBar =
    step === "input" && (inputMode === "script" || inputMode === "paste" || inputMode === "camera");

  return (
    // Every tab fills the full content width — the AI-script step lays out as
    // two equal columns, the other tabs flow full-width single column.
    // The bottom padding clears the fixed action bar so the last card is not
    // trapped underneath it.
    // One centred column with its own gutters, matching the design and the
    // step footer's width. The route opts out of the shared page padding, so
    // without this the content ran edge to edge — flush against the sidebar on
    // desktop and touching both screen edges on a phone.
    <div className={`mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 ${anyActionBar ? "pb-28" : "pb-6"}`}>

      {/* Settings banner — shown until profile is saved */}
      {onboardingDone === false && (
        <button
          type="button"
          onClick={() => router.push("/settings")}
          className="w-full text-left flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 hover:bg-amber-100 transition-colors group"
        >
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Complete your profile to get the most out of your videos</p>
            <p className="text-xs text-amber-600 mt-0.5">Add your headshot, AI avatar photo, voice, logo, and contact info in Settings. They appear in every video you create.</p>
          </div>
          <span className="text-amber-500 text-sm font-semibold shrink-0 group-hover:underline">Go to Settings →</span>
        </button>
      )}

      {/* Voice clone prompt.
          Cloning is opt-in and buried in Settings, and a video renders fine
          without it — just in a stock voice — so agents had no way to discover
          the feature or to notice they were missing it. Held back until the
          profile banner above is gone so a new user only ever sees one nudge. */}
      {onboardingDone !== false && hasVoiceClone === false && (
        <button
          type="button"
          onClick={() => router.push("/settings#voice")}
          className="w-full text-left flex items-start gap-3 bg-spark-blue/10 border border-spark-blue/25 rounded-xl px-4 py-3 mb-5 hover:bg-spark-blue/10 transition-colors group"
        >
          <Mic size={17} className="text-spark-blue shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-spark-ink">Your videos are using a stock voice</p>
            <p className="text-xs text-spark-blue mt-0.5">
              Record about 30 seconds once, and every video you make from then on speaks in your own voice.
            </p>
          </div>
          <span className="text-spark-blue text-sm font-semibold shrink-0 group-hover:underline">Clone my voice →</span>
        </button>
      )}

      {/* ── Step 1 · the whole brief ──
          Mode, place, optional audience and tone, and the topic are one step.
          They are all answers to "what video am I making", so splitting them
          across screens made the flow feel longer than the work. Next carries
          on to format, avatar and music in the editor. */}
      {/* ── Hero ──
          The one display-type moment on the page. Playfair is opted into here
          rather than inherited by every heading, per the brand guide, and the
          three tagline verbs carry the four-stop gradient.
          It asks the question the two rows below it answer. "Hit the Mic. Be
          Visible." was a slogan sitting above a set of controls it did not
          introduce — and it named the microphone, which is one route in out
          of several. */}
      {/* Centred as a block, headline and subhead together. Centring the
          headline alone over left-aligned lines reads as a mistake rather
          than a choice. The rows below stay left-aligned — a centred hero
          over left-aligned controls is the ordinary shape. */}
      {step === "input" && (
        <div className="pt-2 text-center">
          <h1 className="font-display text-[40px] font-semibold leading-[1.0] tracking-[-0.02em] text-spark-ink text-balance sm:text-[52px]">
            {/* One verb, not the three. "Speak, Spark, Share" is the tagline
                and still carries the logo, but as a headline it asked how you
                would do three things at once over a screen whose first
                question is what you are making. Spark is also a noun now — the
                folder this page creates — so the verb and the thing it makes
                are deliberately the same word. */}
            What will you{" "}
            <span className="bg-gradient-to-r from-spark-amber via-[#52665D] to-spark-blue bg-clip-text text-transparent">
              Spark
            </span>
            ?
          </h1>
          {/* Two jobs, so two lines: the routes in, then what they are for.
              Run together at this size it reads as one long breath, and the
              promise — the half that answers "why bother" — is the half that
              gets skimmed. */}
          {/* Dark amber rather than muted grey, and a size up. primary-700 is
              #8D580F — the same deep amber the Spark Card uses for the line
              that needs reading. Muted grey at 15px made the half that answers
              "why bother" the quietest thing on the screen. */}
          {/* A size above the line below it: the routes in are what you act
              on, the promise underneath is why. Same size for both made them
              one block to skim past. */}
          <p className="mt-3 text-[19px] leading-[1.5] text-primary-700">
            A video with your avatar, record yourself, create a blog—or do both.
          </p>
          <p className="mt-1.5 text-[17px] leading-[1.5] text-primary-700">
            Turn your Spark into more ways to connect, build trust, and stay visible.
          </p>

          {/* Under the subheads, so the page still says what it is before it
              asks you to talk to it. Feeds the composer in section 3 rather
              than being a second brief of its own. */}
          <HeroMic
            disabled={locGenerating}
            onHeard={(text) => {
              setSparkSeed((s) => ({ text, n: s.n + 1 }));
              // The words land two sections down. Without this they arrive
              // somewhere the speaker cannot see, which reads as nothing
              // having happened.
              requestAnimationFrame(() => {
                document.getElementById("spark-composer")?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                });
              });
            }}
          />
        </div>
      )}

      {/* ── Row 1 · how it gets made ──
          One row used to ask two questions: three tiles chose where the words
          come from and the fourth chose who does the filming. That mix is why
          the camera tab had to ask about the script a second time once you
          were inside it. Split in two, each row asks one thing.

          It is you either way, live or as your avatar speaking in your cloned
          voice. What differs is whether you press record or we render it —
          which is also the whole of what it costs, so each tile says so. */}
      {/* Now that the nav verb is Create, this row is what you are creating
          rather than only how you appear — so the blog belongs in it, beside
          the two videos, not in the source row below where it was the odd one
          out among three answers to "where do the words come from". */}
      {/* "Sparking", not "making" — the product's own verb, the one in the
          headline above and on the button at the end. */}
      {step === "input" && <SectionHead className="mt-7" eyebrow="1 · Create" question="What are you sparking?" />}
      {step === "input" && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {/* Avatar first, because avatar is what the page opens on.
              inputMode starts at "script", so this tile is already lit when
              you arrive — and a selected control sitting second, to the right
              of an unselected one, reads as something you changed rather than
              the default you were given. First position and highlighted say
              the same thing; second position and highlighted disagree. */}
          {([
            {
              key: "spark" as const,
              // Both video tiles share the "Video —" prefix so they read as two
              // kinds of one thing, which is what they are. They stay separate
              // tiles because what differs is cost and gating, not format: this
              // one spends a video from the plan, the other is free, and the
              // trial lock hits one and not the other. A single Video tile
              // would push that choice into a second step and move the price
              // away from the moment of choosing.
              label: "Video — My Avatar",
              desc: "Avatar + cloned voice",
              free: false,
              cost: "Uses 1 video",
            },
            {
              key: "film" as const,
              label: "Video — My Camera",
              // Said here because the alternative is finding out at the end.
              // Nothing checks the window before the camera opens, so a locked
              // user could record fifteen minutes, watch the upload succeed,
              // and meet the 403 only at the save — with the take gone and no
              // copy anywhere but the tab they are about to close.
              // "Your voice" rather than "your camera": the camera is implied
              // by the label, and what actually differs from the other tile is
              // whose voice comes out of the video.
              desc: trialLocked ? "Free trial ended — pick a plan" : "Your voice + teleprompter",
              free: true,
              cost: trialLocked ? "Locked" : "Free",
            },
            {
              key: "blog" as const,
              label: "Blog post",
              // Said on the tile, before a minute is spent writing a script
              // that arrives with no article attached and nothing explaining
              // the gap. The 30-day window is the same one camera recording
              // and the AI Tools run on.
              // Kept as "Blog post" rather than given a "Video —" prefix: it is
              // the one output on this row that is not a video, and the odd one
              // out is the point.
              desc: trialLocked
                ? "Free trial ended — pick a plan"
                : "New article, or paste your own",
              free: true,
              cost: trialLocked ? "Locked" : "Included",
            },
          ]).map(({ key, label, desc, free, cost }) => {
            const active = key === "blog"
              ? blogOnly
              : blogOnly ? false
                : key === "film" ? inputMode === "camera" : inputMode !== "camera";
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === "blog") {
                    if (trialLocked) {
                      router.push("/billing");
                      return;
                    }
                    setBlogOnly(true);
                    // The format picker is hidden on this route, so a Longform
                    // pick made before switching must not carry over unseen.
                    setLocLength("standard");
                    // Neither of the two routes a blog cannot come from. The
                    // camera records rather than writes, and a pasted script
                    // is words you already have — nothing to research, nothing
                    // to expand.
                    if (inputMode === "camera" || inputMode === "paste") {
                      setInputMode("script");
                      setLastSparkTab("script");
                    }
                    return;
                  }
                  if (key === "film" && trialLocked) {
                    router.push("/billing");
                    return;
                  }
                  setBlogOnly(false);
                  setInputMode(
                    key === "film" ? "camera" : lastSparkTab === "camera" ? "script" : lastSparkTab
                  );
                }}
                aria-pressed={active}
                className={`flex min-h-[86px] items-center rounded-[14px] px-4 py-3 text-left transition-colors ${
                  active
                    ? "border-[1.5px] border-spark-amber bg-white"
                    : "border-[1.5px] border-spark-rule bg-white/60 hover:border-spark-rule-dim"
                }`}
              >
                {/* No icon. Three decorative glyphs competed with the labels
                    for the same glance without telling you anything the words
                    did not — and with the longer "Video — …" labels they were
                    pushing the text into three lines on a narrow column. */}
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold leading-[1.15] text-spark-ink">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-[1.3] text-spark-ink-muted">{desc}</span>
                  {/* Under the description rather than beside the label. Next
                      to it, the badge set the width the label had to wrap
                      around; here each tile reads top to bottom — what it is,
                      what it does, what it costs. */}
                  <span className="mt-1.5 block">
                    <CostPill free={free} emphasis>{cost}</CostPill>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Row 2 · where the script comes from ──
          Filming it yourself. This is the row that used to sit inside the
          camera card, under a heading about the script, one level below the
          tab that had already been chosen — up here it stops reading as the
          same question asked twice. Once you are recording it dims instead of
          disappearing — see cameraSourceLocked. */}
      {step === "input" && inputMode === "camera" && (
        <>
          <SectionHead className="mt-7" eyebrow="2 · Script source" question="How should your script begin?" />
          <div
            className={`mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 ${
              cameraSourceLocked ? "opacity-45" : ""
            }`}
          >
            {/* Five, in descending order of how much writing we do for you —
                ending at the one where we do none. Three columns, not four:
                five tiles across four leaves one stranded on a row of its
                own, which reads as a different kind of control. */}
            {([
              { key: "speak" as const,     kicker: "Fastest",          label: "AI writes it",              desc: "Turn a topic into a script" },
              // Not "Upload a PDF": this route takes a link as well, and the
              // kicker already says which two.
              { key: "uploads" as const,   kicker: "PDF or link",      label: "From a document",           desc: "Use a report, guide, or flyer" },
              { key: "audio" as const,     kicker: "Already recorded", label: "A recording of me talking", desc: "We transcribe it into your script" },
              { key: "own" as const,       kicker: "Word for word",    label: "I'll write it",             desc: "Use your own finished copy" },
              { key: "freestyle" as const, kicker: "No script",        label: "Speak naturally",           desc: "Record without a prepared script" },
            ]).map(({ key, kicker, label, desc }) => (
              <SourceTile
                key={key}
                kicker={kicker}
                label={label}
                desc={desc}
                active={cameraSource === key}
                disabled={cameraSourceLocked}
                onClick={() => setCameraSource(key)}
              />
            ))}
          </div>
          {/* Dimmed type on its own says "unavailable" but not why. One line,
              and only while it is actually locked. */}
          {cameraSourceLocked && (
            <p className="mt-1.5 text-[11px] leading-[1.4] text-spark-ink-faint">
              {cameraMode === "brand" && canBrandClips
                ? "Not used while you're branding a clip you already shot."
                : "Set for this take. Start over to change where the script comes from."}
            </p>
          )}
        </>
      )}

      {/* The same question on the render-it-for-me side. Three of the four
          original tabs, minus the camera one that row 1 now owns. */}
      {step === "input" && inputMode !== "camera" && (
        <>
        <SectionHead
          className="mt-7"
          eyebrow={blogOnly ? "2 · Source" : "2 · Script source"}
          question={blogOnly ? "What should the article come from?" : "How should your script begin?"}
        />
        <div className={`mt-2.5 grid grid-cols-1 gap-2 ${blogOnly ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {([
            // The blog description names both ways in. This tile is the only
            // route to the article writer, and since it now takes material the
            // agent already has — a forwarded email, a PDF, a link — a label
            // that says only "a topic" hides half of what it does.
            { mode: "script" as InputMode,  kicker: "Fastest",               label: "AI writes it",          desc: blogOnly ? "From a topic, or from an article you already have" : "Turn a topic into a script" },
            // Only the two routes that write an article. A pasted script is
            // words you already have, so there is nothing for us to research
            // and nothing to expand — and it is the one route that has never
            // produced a blog.
            ...(blogOnly ? [] : [
              { mode: "paste" as InputMode, kicker: "Word for word", label: "Paste my script", desc: "Use your own finished copy" },
            ]),
            // One tile, two things, so the description has to carry both. The
            // mock split it into Add Listing URL and Upload photos, but photos
            // on their own cannot write a script — that is the photo reel,
            // which is a different renderer and free.
            // "Free" is in the description rather than on a pill. The pill sat
            // beside a two-line kicker and a two-line label in the narrowest
            // tile on the row, and three stacked things in one corner is what
            // made this tile read as crowded. The blog-mode kicker keeps its
            // own wording: there is no photo route on that side.
            { mode: "listing" as InputMode, kicker: blogOnly ? "Zillow or MLS" : "Zillow, CRM, or photos", label: blogOnly ? "My listings" : "My listings/My photos", desc: blogOnly ? "Turn a listing into a property article" : "Turn a listing into a script, or photos into a reel. Free." },
          ]).map(({ mode, kicker, label, desc }) => (
            <SourceTile
              key={mode}
              kicker={kicker}
              label={label}
              desc={desc}
              // Blog mode only. The listing tile used to carry its own
              // "Photo reel free" pill here; that now reads as plain "Free."
              // at the end of its description, which is the same fact without
              // a third element competing for the same corner.
              cost={blogOnly ? <CostPill free>Free</CostPill> : undefined}
              active={inputMode === mode}
              onClick={() => { setInputMode(mode); setLastSparkTab(mode); }}
            />
          ))}
          {/* The blog tile lived here for one commit. It is in row 1 now,
              beside the two videos: this row answers where the WORDS come
              from, and "a blog post" is not an answer to that — it is what
              comes out at the other end. */}
        </div>
        </>
      )}

      {/* Puts the price beside the choice that sets it — otherwise it only
          surfaces three steps later, after a script has been written.

          Row 1 is now almost the whole rule: filming it yourself is free,
          rendering spends from your plan. The photo reel is the one
          exception, and it is named rather than left to be discovered.

          "Costs one credit" was this screen's own word for it. Billing has
          never sold credits — plans hold a short-video allowance and a long-
          video allowance, counted separately — so the only place the word
          appeared was the one place it would set the wrong expectation. */}
      {/* Nothing on the blog route uses a video, so the line explaining what
          "uses 1 video" means has nothing to explain there. */}
      {step === "input" && !blogOnly && (
        <p className="mt-2 text-[12.5px] leading-[1.45] text-spark-ink-muted">
          {/* The pills above now carry which route costs what, so this line
              stops repeating them and says the thing they cannot: that the
              choice is not the charge. People hesitate over a script because
              they think editing spends something. */}
          &ldquo;Uses 1 video&rdquo; means one of your short or long videos from your plan.
          Nothing is spent until you press <strong className="font-semibold text-spark-ink">Spark Video</strong> —
          picking a route, writing a script and setting the video up are all free.
        </p>
      )}

      {/* What the lit tile cannot say: what you actually end up with. Leaving
          the mode needs no instructions now that it is one of three tiles in
          a row — pressing another one is the way out. */}
      {step === "input" && blogOnly && (
        <p className="mt-2 text-[12.5px] leading-[1.45] text-spark-ink-muted">
          <strong className="font-semibold text-spark-ink">No video will be made.</strong>{" "}
          You&rsquo;ll get an article of usually 800 to 1,200 words with headings, ready to paste into your site — plus
          the title, description and hashtags to go with it.
        </p>
      )}

      {/* ── Your topic ──
          One card, per the v2 composer. The speak-or-type choice used to be
          two large tiles in a section of their own, above a second section
          holding the actual input — two headings and a rule between the
          decision and the thing it changed. It is now a segmented control in
          this card's header, next to the input it switches.

          Trending and templates stay below the card rather than inside it:
          they are other ways to fill the same field, not part of the composer,
          and folding them in would have made the card the whole page. */}
      {inputMode === "script" && step === "input" && (
        <div className="mt-7 flex flex-col gap-4">
          {/* Just the section and its number.
              It read "Topic details · AI writes it · Step 1 of 5", which was
              three claims where one was wanted. The step count was true of the
              whole page, not of this third section — so hanging it here made
              Video style and Script source above look like they sat outside
              the flow — and the topbar already carries it, with a progress
              rail, at the top of every screen. The tab name went the same way:
              row 2 is directly above with that tile lit. */}
          <SectionHead
            // Always 3 now. Row 1 stays on screen in blog mode — it is where
            // the blog was chosen — so nothing shifts up behind it.
            eyebrow="3 · Topic details"
            question={blogOnly ? "What is your article about?" : "What is your video about?"}
            // "Spark" rather than "Start" — the product's own verb for this,
            // and the same one on the button it eventually leads to.
            aside="Spark with a template or idea below."
          />
          {/* Named so the hero mic can bring what it heard into view. */}
          <div id="spark-composer" className="scroll-mt-20" />
          <ComposerCard
            showTryLine={!locCustomTopic.trim()}
            tryLines={TRY_LINES}
            // Four nouns. "What's it about?" here was the third asking of the
            // section's own question, and "Which town?" was a question in both
            // of its states.
            chips={[
              { label: "Topic", ok: !!locCustomTopic.trim() },
              { label: "Town", ok: locationSet },
              { label: "Audience", ok: !!locAudience.trim() },
              // Always satisfiable now that format is asked on this step. It
              // starts on a default, so this reads as "set" from the outset —
              // the chip is a reminder of what you can say, not a blocker.
              { label: "Format", ok: formatTouched },
            ]}
          >
            {/* One input for both ways in. Speech writes into the box, typing
                edits it, and Send commits — so a misheard word is a keystroke
                to fix rather than the whole brief said again. The speak-or-type
                choice this replaced was asking which of two boxes to show, when
                the answer was always "the one that takes both". */}
            <VoiceBriefSession
              disabled={locGenerating}
              onSwitchToTyping={() => { /* the box already takes typing */ }}
              // Only ever fills blanks it has an answer for — a null slot
              // must not wipe something already typed or picked from a chip.
              onSlots={(s) => {
                if (s.city) setLocCity(s.city);
                if (s.state) setLocState(s.state);
                if (s.topic) { setLocCustomTopic(s.topic); setTopicTemplateRaw(null); }
                if (s.audience) { setLocAudience(s.audience); rememberAudience(s.audience); }
                if (s.tone) setLocTone(s.tone);
                if (s.length) { setLocLength(s.length); setFormatTouched(true); }
                if (s.platform) { setLocPlatform(s.platform); setFormatTouched(true); }
                // Long form renders landscape only. Said together, "long reel"
                // has to resolve to something buildable, and the length is the
                // half that changes the script.
                if (s.length === "long") setLocPlatform("youtube");
              }}
              onReady={(sl) => { if (!locGenerating) handleGenerateScript(sl); }}
              // This panel's button and the one in the footer call the same
              // handler, so they have to agree on what it does. Only this
              // instance takes a mode — the camera one below is always a
              // script.
              mode={blogOnly ? "blog" : "script"}
              onDraftChange={setBriefHasDraft}
              seed={sparkSeed}
            />
          </ComposerCard>

          {/* The six quick chips used to sit here, above the panel — a second
              template picker stacked on the one below it, under a label
              ("Start with a template or idea") that said almost exactly what
              the panel's own title says. Every one of the six was already
              inside it, one tab away. They are in the panel now, under its
              title; the label moved up to the section question, where it
              points at them. */}

          {/* ── Spark an idea ──
              Flush against the composer above it. The -mt-4 cancels this
              column's gap: the card rounds at the top, the panel rounds at the
              bottom, and between them there is a single shared rule. They fill
              the same field, so a gap made choosing an idea look like a
              different exercise from typing one. */}
          <div className="-mt-4">
          <SparkPanel
            city={locCity || undefined}
            state={locState || undefined}
            // Also drops the topic into the composer, so a pick is the start of
            // a sentence you can add to rather than a silent field change
            // somewhere further down the page.
            onSelect={(topic, raw) => {
              setLocCustomTopic(topic);
              setTopicTemplateRaw(raw);
              setSparkSeed((s) => ({ text: topic, n: s.n + 1 }));
            }}
          />
          </div>

          {/* The blog route's way in for material the agent already has.
              Until now this path could only write from a topic or from a
              listing — so an agent who had forwarded an article, saved a market
              report or had a link to one had no way to use any of it on the one
              screen whose whole job is writing an article. */}
          {blogOnly && (
            <div className="rounded-[18px] border border-spark-rule bg-white px-5 py-4">
              <ArticleSource
                purpose="article"
                doc={{
                  mode: blogSrcMode,
                  onModeChange: setBlogSrcMode,
                  attached: !!blogSrcText,
                  attachedName: blogSrcName,
                  onClear: () => { setBlogSrcText(""); setBlogSrcName(""); setBlogSrcUrlInput(""); },
                  uploading: blogSrcUploading,
                  onUploadPdf: handleBlogSrcPdf,
                  urlInput: blogSrcUrlInput,
                  onUrlInputChange: setBlogSrcUrlInput,
                  onFetchUrl: handleBlogSrcUrl,
                  fetching: blogSrcFetching,
                  onPickEmail: handleBlogSrcEmail,
                  // Only on this route. Pasting into the script tab means
                  // "speak these words"; pasting here means "make an article
                  // out of this", which is a different job for the same gesture.
                  onPasteText: handleBlogSrcText,
                }}
              />
              {/* Said where it is decided, not discovered in the output. The
                  writer is told to keep the source's facts and angle and to
                  write its own sentences — this is that promise, in the words
                  an agent would use for it. */}
              {blogSrcText && (
                <p className="-mt-2 text-[11px] leading-[1.5] text-spark-ink-muted">
                  Your article will cover what this covers, written for{" "}
                  {locCity.trim() ? `${locCity.trim()}${locState.trim() ? `, ${locState.trim().toUpperCase()}` : ""}` : "your market"}
                  {/* Somebody else's piece and your own draft need different
                      promises. "Not a copy of the original" is reassurance
                      about a newsletter and an insult about your own writing. */}
                  {blogSrcMode === "text"
                    ? " — built out into a full article with headings, not just tidied up."
                    : " in your voice — not a copy of the original."}
                </p>
              )}
            </div>
          )}
        </div>
      )}


      {/* ══════════════════════════════════════════
          AI SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "script" && step === "input" && (
        <div className="mt-4 flex flex-col gap-3">

          {/* ── Where / Who / What ──
              One shaded panel of questions, as in the design, rather than a
              two-column grid of loose fields.

              Where is per video, not per account: one agent covers several
              areas and will make a different video for each, so this is a
              question the page has to ask rather than a profile setting it can
              assume. It seeds the trending list too. */}
          <section className="rounded-[18px] border border-spark-rule bg-[#f4f2e8] px-5 py-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-muted">
                City + State
              </p>
              <p className="text-[14px] text-spark-ink-muted">
                {locationSet ? "Set" : "Say it or type it"}
              </p>
            </div>

            {savedMarkets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {savedMarkets.map((m) => {
                  const isActive =
                    (m.city ?? "").toLowerCase() === locCity.trim().toLowerCase() &&
                    (m.state ?? "").toUpperCase() === locState.trim().toUpperCase();
                  return (
                    <div
                      key={`${m.city}-${m.state}`}
                      onClick={() => { setLocCity(m.city); setLocState(m.state); }}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        isActive
                          ? "border-spark-amber bg-spark-amber text-white"
                          : "border-spark-rule bg-white text-spark-ink-soft hover:border-spark-amber hover:text-spark-amber"
                      }`}
                    >
                      {m.city}, {m.state}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMarket(m.city, m.state); }}
                        className={`ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[12px] transition-colors ${
                          isActive ? "text-white hover:bg-spark-blue" : "text-spark-ink-faint hover:bg-spark-rule-soft"
                        }`}
                        aria-label={`Remove ${m.city}, ${m.state}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">City or area</label>
                <div className="flex items-center rounded-[9px] border border-spark-rule bg-white focus-within:ring-2 focus-within:ring-spark-amber">
                  <input
                    type="text"
                    value={locCity}
                    onChange={(e) => setLocCity(e.target.value)}
                    // Deliberately not a real town. Naming one puts a single
                    // market in front of every user in the country, and this
                    // field is the whole subject of the video.
                    placeholder="Your city or area"
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] text-spark-ink placeholder:text-spark-ink-faint focus:outline-none"
                  />
                  <FieldMic onTranscript={(t) => setLocCity(t.replace(/[.,]\s*$/, "").trim())} title="Say the city" />
                </div>
              </div>
              <div className="w-24">
                <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">State</label>
                <div className="flex items-center rounded-[9px] border border-spark-rule bg-white focus-within:ring-2 focus-within:ring-spark-amber">
                  <input
                    type="text"
                    value={locState}
                    onChange={(e) => setLocState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-[15px] uppercase text-spark-ink placeholder:text-spark-ink-faint focus:outline-none"
                  />
                  <FieldMic onTranscript={(t) => setLocState(toStateAbbr(t))} title="Say the state" />
                </div>
              </div>
            </div>

            {locationSet && !isMarketSaved && (
              <button
                type="button"
                onClick={() => addMarket(locCity, locState)}
                className="self-start text-[13px] font-medium text-spark-amber hover:text-spark-blue"
              >
                + Save {locCity}, {locState.toUpperCase()} so it is one tap next time
              </button>
            )}
          </div>

          {/* Audience, style and CTA are optional and Length is the only
              required one (it already defaults to Standard, so it is never
              empty) — but all four stay visible and pickable up front rather
              than behind an Edit toggle. Hiding them made "optional" read as
              "hidden", and the user should see what they can set without a
              click to find out.

              No card of its own now: these sit inside the shaded ask panel
              with Where, so the page asks its questions in one place. */}
          <div className="mt-6">
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      // Custom audiences join the list. Saying "people
                      // relocating" used to land nowhere: the value was not one
                      // of the six, so the select showed blank and the answer
                      // was silently lost. Anything spoken or saved is an
                      // option here, and persists for next time.
                      label: "Audience", value: locAudience, set: setLocAudience,
                      options: [
                        ["", "Any"],
                        ...BASE_AUDIENCES.map((a) => [a, a] as [string, string]),
                        ...customAudiences.map((a) => [a, a] as [string, string]),
                      ] as [string, string][],
                    },
                    {
                      // "Tone" is what the field is — the voice the script is
                      // written in. "Style" reads as a visual setting on a
                      // screen whose other controls are all visual.
                      label: "Tone", value: locTone, set: setLocTone,
                      options: [["", "Any"], ["Friendly", "Friendly"], ["Modern", "Modern"], ["Luxury", "Luxury"], ["High-Energy", "High-Energy"], ["Educational", "Educational"]],
                    },
                    {
                      label: "Why", value: locPurpose, set: setLocPurpose,
                      options: [
                        ["", "Any"],
                        ["found", "Get found"],
                        ["answer", "Answer a question they keep asking"],
                        ["appointment", "Win the appointment"],
                        ["topofmind", "Stay top of mind"],
                        ["announce", "Announce something"],
                      ] as [string, string][],
                    },
                    {
                      label: "Call to action", value: locCta, set: setLocCta,
                      // "None" is a real choice now, not just an unset dropdown
                      // — it tells the script to skip the CTA section entirely
                      // rather than fall back to a generic "reach out today".
                      options: [["", "Default"], ["none", "None"], ["call", "Call"], ["text", "Text"], ["website", "Website"], ["consultation", "Consult"]],
                    },
                  ].map(({ label, value, set, options }) => (
                    <div key={label}>
                      {/* All three are optional and every one of them defaults
                          to a usable answer. Saying so on the label is what
                          stops the row reading as three more things to fill
                          in before the button will work. */}
                      <label className="mb-1.5 block text-[13px] font-medium text-spark-ink-soft">
                        {label} <span className="font-normal text-spark-ink-faint">(optional)</span>
                      </label>
                      <div className="relative">
                        <select
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          className="w-full appearance-none rounded-[9px] border border-spark-rule bg-white px-3 py-2.5 pr-8 text-[15px] text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber"
                        >
                          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-spark-ink-faint" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── What? · Shorts or Longform ──
                    Shape and length together, because they are one decision
                    to say out loud ("a short vertical one", "a longform video")
                    and because the script is written to the length — by the
                    time you reach the editor the words already exist.

                    Shorts run either way up; longform is horizontal only. That
                    is not a UI choice — the render refuses long form for
                    vertical (see isLongForm in api/video/create-blog), so a
                    vertical longform tile would quietly clamp the script back
                    to the three-minute short cap. */}
                {/* Not on the blog route: no video is made there, and this
                    choice was quietly deciding how long the hidden script got.
                    A Longform script can be written from the article later. */}
                {!blogOnly && (
                <div className="mt-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-spark-ink-muted">
                      Choose your format
                    </p>
                    <p className="text-[14px] text-spark-ink-muted">Default, change it anytime</p>
                  </div>
                  <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      // Where it gets posted, not just what shape it is. Both
                      // Shorts tiles are called Shorts, so the sub-line is the
                      // only thing telling them apart — and "9:16" says less
                      // about which to pick than "Reels, Shorts + TikTok".
                      { p: "reel", l: "standard", title: "Vertical 9:16", sub: "Up to 3 min · Reels, Shorts + TikTok", w: "11px", h: "17px" },
                      { p: "youtube", l: "standard", title: "Horizontal 16:9", sub: "Up to 3 min · YouTube + websites", w: "20px", h: "12px" },
                      { p: "youtube", l: "long", title: "Longform 16:9", sub: "Up to 8 min · YouTube + websites", w: "20px", h: "12px" },
                    ] as const).map(({ p, l, title, sub, w, h }) => {
                      const on = locPlatform === p && locLength === l;
                      return (
                        <button
                          key={`${p}-${l}`}
                          type="button"
                          onClick={() => { setLocPlatform(p); setLocLength(l); setFormatTouched(true); }}
                          aria-pressed={on}
                          className={`relative flex min-h-[58px] flex-col justify-center gap-0.5 rounded-[12px] border bg-white px-3 py-2.5 text-left transition-colors ${
                            on ? "border-spark-amber" : "border-spark-rule hover:border-spark-rule-dim"
                          }`}
                        >
                          {on && (
                            <span className="pointer-events-none absolute -inset-px rounded-[13px] border-[2.5px] border-spark-amber" />
                          )}
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`flex-none rounded-[3px] border-[1.5px] ${on ? "border-spark-amber" : "border-spark-ink-faint"}`}
                              style={{ width: w, height: h }}
                            />
                            <span className="text-[14px] font-semibold leading-[1.1] text-spark-ink">{title}</span>
                          </span>
                          <span className="text-[12px] leading-[1.2] text-spark-ink-muted">{sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  {locLength === "long" && (
                    <p className="mt-2 text-[12.5px] leading-[1.4] text-spark-ink-faint">
                      Longform runs up to 8 minutes, reads your full script start to finish, and
                      uses your uploaded photos as the visuals. Horizontal only.
                    </p>
                  )}
                </div>
                )}
              </div>
            </div>
          </section>

          {/* The Next button itself now lives in the fixed footer below, so it
              stays reachable without scrolling to the bottom of the brief.
              This spacer keeps the last card clear of it. */}
          <div className="h-2" />

        </div>
      )}

      {/* ── Fixed action bar ──
          v2 pins the primary action to the bottom of the screen with the
          status line beside it, so "what do I do next" never scrolls away.
          The Back slot is held open but empty: this page is step 1, and step 2
          is a different route, so there is nowhere back to go yet. */}
      {showActionBar && (
        <StepFooter
          hint={
            // Nothing to run out of on the blog route, so the out-of-videos
            // warning does not belong on it.
            outOfVideos && !blogOnly
              ? "You have no videos left this month. Filming it yourself is still free."
              : locGenerating
                ? "Researching the area and writing. This takes about a minute."
                : !locationSet
                  ? "Add the city and state above to carry on."
                  : !locCustomTopic.trim()
                    ? (briefHasDraft
                        // The topic is on screen, just not sent. Telling
                        // someone to supply what they can already see reads as
                        // the page not working.
                        ? "Press Send to add what you've typed."
                        : `Say or pick what the ${blogOnly ? "article" : "video"} is about to carry on.`)
                    : blogOnly
                      ? "Usually 800 to 1,200 words, with headings, ready to paste into your site. You can turn it into a video afterwards."
                      : "We'll write the script first, then you pick how it looks."
          }
        >
          <Button
            // Wrapped: bare, the click event would arrive as the spoken overrides.
            onClick={() => handleGenerateScript()}
            loading={locGenerating}
            disabled={!canContinue}
            size="lg"
            className="gap-2"
          >
            {locGenerating
              ? <>Sparking<span className="hidden sm:inline"> your {blogOnly ? "article" : "script"}</span>…</>
              : blogOnly
                ? <>Write<span className="hidden sm:inline"> the blog</span> <ArrowRight size={18} /></>
                : <>Next<span className="hidden sm:inline"> · video setup</span> <ArrowRight size={18} /></>}
          </Button>
          {/* The way out, beside the thing they cannot do. Sending someone to
              billing as a redirect is a worse welcome than offering it here. */}
          {outOfVideos && (
            <a
              href="/billing"
              className="text-[13px] font-semibold text-spark-blue underline underline-offset-2 hover:text-spark-blue-deep"
            >
              Get more videos
            </a>
          )}
        </StepFooter>
      )}

      {/* My Material. Its CTA sat at the bottom of a two-column page that is
          taller than the viewport on arrival, so the thing you came to press
          was never on screen when you needed it. */}
      {inputMode === "paste" && step === "input" && (
        <StepFooter
          hint={
            pasteGenerating
              ? "Saving your script…"
              : !pasteScript.trim()
                ? "Paste or write your script above to carry on."
                : `${pasteWordCount} words. We'll set the video up next.`
          }
        >
          <Button
            onClick={handlePasteScript}
            loading={pasteGenerating}
            disabled={!pasteScript.trim()}
            size="lg"
            className="gap-2"
          >
            {pasteGenerating
              ? <>Saving…</>
              : <>Next<span className="hidden sm:inline"> · video setup</span> <ArrowRight size={18} /></>}
          </Button>
        </StepFooter>
      )}

      {/* My Camera. Four ways in, and the bar follows whichever was chosen
          rather than offering one action that is wrong for the other three.
          Each route keeps its own sub-action inside its own card; the bar is
          for the step, not for the card. */}
      {inputMode === "camera" && step === "input" && (
        <StepFooter
          hint={
            // Uploading footage is the one route with no script and no Open
            // Camera, so every hint below it was wrong there — the bar told
            // you to type a script and press a button that isn't on screen.
            cameraMode === "brand" && canBrandClips
              ? "Pick a clip above, choose what gets burned in, then render it."
              // Nothing to write and nothing to wait for — the only hint this
              // route needs is that the button below is already the next step.
              : cameraSource === "freestyle"
              ? "No script to write. Set your shape and branding below, then press Open Camera and talk."
              : cameraScriptGenerating
              ? "Writing your teleprompter script…"
              : readyToContinue
                ? "We'll transcribe your recording, then you can edit it."
                : cameraGeneratedScript.trim()
                  ? "Script ready. Press Open Camera to record it."
                  : cameraSource === "speak"
                    ? "Say what the video is about, and we'll write the script."
                    : cameraSource === "uploads"
                      ? "Attach a PDF or URL, then write the script from it."
                      : cameraSource === "audio"
                        ? "Drop a recording of yourself talking, audio or video, and we'll turn what you said into a script."
                        : "Type your script below, then press Open Camera."
          }
        >
          {/* Three ways into this tab, and the footer used to know about two.
              With a script already written from uploads there is no topic to
              spark from, so it showed a disabled Spark script — a dead primary
              beside a hint telling you to look elsewhere. It now carries an
              action only when it has one, and Open Camera in the card below is
              left to be the next step it already is. */}
          {/* Nothing for this bar to do on the upload route either: the render
              button lives in the card, and Spark script was appearing beside a
              clip brander with no topic to spark from. */}
          {/* Transcribe & continue is the only action this bar owns.
              It used to carry a second Spark script button as well — on the
              spoken route, which is the one route where the brief panel
              already has one. Two amber primaries with the same label and the
              same effect were on screen together, one of them a full page
              away from the brief it acted on. The panel's stays, because it
              sits beside the thing it reads. */}
          {cameraMode === "brand" && canBrandClips ? null : readyToContinue ? (
            <Button onClick={handleContinue} size="lg" className="gap-2">
              Transcribe<span className="hidden sm:inline"> &amp; continue</span>{" "}
              <ArrowRight size={18} />
            </Button>
          ) : null}
        </StepFooter>
      )}

      {/* ══════════════════════════════════════════
          PASTE SCRIPT TAB
      ══════════════════════════════════════════ */}
      {inputMode === "paste" && step === "input" && (
        <div className="mt-7 max-w-3xl">
          {/* Third section of this page, counted with the other two. The step
              count it used to carry belongs to the whole page and is in the
              topbar; the tab name is the lit tile directly above. */}
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-spark-amber">
            3 · Your script
          </p>
          {/* One column, top to bottom.
              Two columns asked which side to begin on and answered neither:
              the script on the left, the material that feeds it on the right,
              and no reading order between them. Now the page IS the order —
              choose how the script gets written, give it what it needs, read
              what came back. */}
          <div className="flex flex-col gap-3 min-w-0 mt-2">
          <Card padding="sm" className="p-3 border-t-4 border-t-spark-amber">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-full bg-gradient-to-br from-spark-amber to-spark-amber-glow text-white flex items-center justify-center text-base font-bold shrink-0 shadow-sm">1</span>
              <div>
                <p className="text-base font-bold text-brand-text">Your Script</p>
                <p className="text-sm text-spark-ink-muted">Spoken exactly as written</p>
              </div>
            </div>

            {/* Which way in — asked before anything else, the way the listings
                tab asks how you want to get the details in. */}
            <div className="mb-4">
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  // Named by what happens to the words, not by the action. Both
                  // of these begin with pasting, so labels that both said
                  // "paste" described the same gesture twice and left the
                  // difference — spoken as written, versus cut down to fit — to
                  // be worked out from the small print underneath.
                  { key: "own" as const, label: "My script, word for word", sub: "nothing is rewritten" },
                  { key: "blog" as const, label: "Shorten my article into a script", sub: "too long to read aloud — AI condenses it" },
                  { key: "ai" as const, label: "Let AI draft it", sub: "then edit it yourself" },
                ]).map(({ key, label, sub }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPasteSource(key)}
                    aria-pressed={pasteSource === key}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-colors ${
                      pasteSource === key
                        ? "border-spark-amber bg-spark-amber-tint"
                        : "border-spark-rule bg-white hover:border-spark-rule-dim"
                    }`}
                  >
                    <span className="block text-[12px] font-bold text-brand-text">{label}</span>
                    <span className="block text-[10.5px] text-spark-ink-muted">{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Where the words come from, directly under the choice of how to
                start — because it is an INPUT to the script, not an accessory
                to it. It used to live in the media card at the very bottom of
                the page, below the empty script box it exists to fill and under
                a heading about photos, which is the last place someone looking
                for "I already wrote this" would think to look. */}
            {pasteSource !== "own" && (
              <ArticleSource
                doc={{
                  mode: pastePdfMode,
                  onModeChange: setPastePdfMode,
                  attached: !!pastePdfUrl,
                  attachedName: pastePdfName,
                  onClear: () => {
                    setPastePdfUrl(""); setPastePdfText(""); setPastePdfName(""); setPastePdfUrlInput("");
                  },
                  uploading: pastePdfUploading,
                  onUploadPdf: handlePastePdfUpload,
                  urlInput: pastePdfUrlInput,
                  onUrlInputChange: setPastePdfUrlInput,
                  onFetchUrl: handlePasteUrlExtract,
                  fetching: pastePdfUrlExtracting,
                  onPickEmail: handlePasteEmailPick,
                }}
              />
            )}

            {/* Video length, asked once for all three ways in, and before
                anything that uses it: the summariser and the AI writer both
                take it as their target, and it used to sit below the buttons
                that consume it.

                It also used to live inside the AI panel, so on the tab's own
                path — your words, pasted — there was no length control at all,
                while the warning under the script box said "Pick Longform
                above", naming a thing that was not on screen.

                The renderer's two lengths, not the teleprompter's five: this
                script goes to HeyGen and is clamped there, so offering 4- and
                15-minute options meant writing a script the user picked and
                then cutting it. */}
            <div className="mb-4 pb-4 border-b border-spark-rule-soft">
              <p className="text-sm font-bold text-spark-ink-soft mb-1">Video Length</p>
              <div className="grid grid-cols-2 gap-1.5">
                {RENDERED_SCRIPT_LENGTHS.map((l) => {
                  const isLong = l.key === "rendered_long";
                  /**
                   * Shorts and Longform spend separate balances that never
                   * mix, so having shorts left says nothing about whether a
                   * long one can be made.
                   *
                   * Not a refusal, though: the next step offers to read the
                   * script yourself on camera, which spends neither balance.
                   * Saying "none left" flat would turn a choice about who is
                   * on screen into a wall.
                   */
                  const none = !!allowance && !allowance.unlimited
                    && (isLong ? allowance.long === 0 : allowance.short === 0);
                  return (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setPasteScriptLength(l.key)}
                      aria-pressed={pasteScriptLength === l.key}
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors ${
                        pasteScriptLength === l.key
                          ? "border-spark-amber bg-spark-amber-tint"
                          : "border-spark-rule bg-white hover:border-spark-rule-dim"
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-brand-text">{l.label}</span>
                      <span className="block text-[10px] text-spark-ink-muted">
                        up to {ceilMinutesFor(l.words)} min
                      </span>
                      {/* Said here rather than discovered at Generate — and
                          said as what it is, which is that the avatar render
                          needs one, not that this length is closed. */}
                      {none && (
                        <span className="block text-[10px] font-medium text-amber-600">
                          none left — read it yourself
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10.5px] leading-[1.45] text-spark-ink-faint">
                Either length can be read by your avatar, which uses one video of that
                kind, or by you on camera, which is free. You choose next.
              </p>
              {/* Said before the choice, not discovered after an eight-minute
                  render. Stock footage is composited inside a serverless
                  function with a hard time limit, and a script past ~600 words
                  is skipped rather than risking a timeout that would take the
                  whole job down — so on Longform the photos are the visuals,
                  and with none attached it is the presenter throughout. */}
              {pasteIsLong && (
                <p className="mt-1.5 flex items-start gap-1 text-[10.5px] leading-[1.45] text-amber-600">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  <span>
                    Longform uses your photos for visuals — automatic stock footage only
                    applies to Shorts. {pastePhotos.length === 0
                      ? "With none attached it will be you on screen the whole way through."
                      : `Your ${pastePhotos.length} photo${pastePhotos.length === 1 ? "" : "s"} will loop across the full length.`}
                  </span>
                </p>
              )}
            </div>

            {/* Market for THIS video, asked before either way of writing the
                script rather than after both. Sitting at the foot of the card
                it was answered last, so every AI route — the topic spark and
                the write-from-uploads button — ran with the town still blank
                and wrote to the profile's home city. The script names the
                place, so the place has to be known first.

                Not just metadata either: this becomes the project's
                city/state, which the editor's CTA falls back off. Left blank
                it uses the profile's home city, so a Willow Grove listing went
                out saying Blue Bell. */}
            <div className="mb-4 pb-4 border-b border-spark-rule-soft">
              <p className="text-sm font-bold text-spark-ink-muted uppercase tracking-wide mb-1">Market For This Video</p>
              <p className="text-xs text-spark-ink-faint mb-2 normal-case font-normal">
                Spoken in your channel CTA and used for titles and tags. Set it to the property&apos;s town, not your office.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="text"
                    value={pasteCity}
                    onChange={(e) => setPasteCity(e.target.value)}
                    placeholder="City"
                    className="w-full text-sm px-3 py-2 border border-spark-rule rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                  />
                </div>
                <div className="w-20">
                  <input
                    type="text"
                    value={pasteState}
                    onChange={(e) => setPasteState(e.target.value)}
                    placeholder="ST"
                    maxLength={2}
                    className="w-full text-sm px-3 py-2 border border-spark-rule rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Generate script from uploads. The same sub-action as the
                camera tab's, demoted the same way — it competes with this
                tab's real primary in the footer for the same reason. */}
            {pasteSource === "ai" && (pastePdfText || pastePhotos.length > 0) && (
              <div className="mb-4">
                <Button
                  size="sm"
                  variant="outline"
                  loading={pasteUploadGenerating}
                  onClick={handleGenerateScriptFromPasteUploads}
                  className="gap-1.5"
                >
                  {pasteUploadGenerating
                    ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                    : <><Sparkles size={13} /> Write the script from these</>}
                </Button>
                {/* The photos are never read — only their COUNT reaches the
                    prompt, as one sentence saying how many exist. */}
                {/* Names the thing actually attached. It said "your attached
                    PDF" whichever route the text came in by, so an article
                    brought in from an email or a link was described as a PDF
                    the user had never uploaded. */}
                <p className="text-[11px] text-spark-ink-faint mt-1.5">
                  AI will write a script from {
                    pastePdfMode === "email" ? "the article you forwarded"
                      : pastePdfMode === "url" ? "the page you attached"
                        : "your attached PDF"
                  }.{pastePhotos.length > 0 ? " Your photos become b-roll; they aren't read." : ""}
                </p>
              </div>
            )}

            {/* Summarise something already written.
                Between the two existing ways in: the words are yours, but too
                many of them to speak, so the AI shortens rather than writes.
                What comes back lands in the same box as everything else and is
                spoken exactly as it reads there — nothing renders until you
                press generate, so the review is real. */}
            {pasteSource === "blog" && (
            <div className="mb-4 pb-4 border-b border-spark-rule-soft">
              <p className="text-sm font-bold text-spark-ink-soft mb-2">Your Blog Post</p>
              <textarea
                value={pasteBlogText}
                onChange={(e) => setPasteBlogText(e.target.value)}
                placeholder="Paste your blog post here — or attach its URL above and we'll fetch the text and its images."
                rows={6}
                className="w-full text-sm px-3 py-2.5 border border-spark-rule rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  loading={pasteBlogGenerating}
                  disabled={pasteBlogText.trim().length < 200}
                  onClick={handleScriptFromBlog}
                  className="whitespace-nowrap gap-1"
                >
                  <Sparkles size={13} /> Summarise into a script
                </Button>
                {pasteBlogText.trim() && (
                  <span className="text-[11px] text-spark-ink-faint">
                    {pasteBlogText.trim().split(/\s+/).length.toLocaleString()} words in
                    {pasteBlogText.length > 20000 ? " · too long, trim to 20,000 characters" : ""}
                  </span>
                )}
              </div>
              {/* Said plainly, because it is the whole promise of this option:
                  only what you wrote goes in. Nothing is researched or added. */}
              <p className="text-[11px] text-spark-ink-faint mt-1.5">
                Summarised from your text only — no statistics or facts are added.
                {pastePhotos.length > 0 ? " Your photos become b-roll." : ""}
              </p>
              {/* Only after one actually ran, and says what it produced — the
                  old version was true whenever the script box had anything in
                  it, so it appeared over untouched pasted text. */}
              {pasteSummarised !== null && !pasteBlogGenerating && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle size={11} /> Summarised to {pasteSummarised.toLocaleString()} words. Read and edit it below before generating.
                </p>
              )}
            </div>
            )}

            {/* Let AI Spark The Script */}
            {pasteSource === "ai" && (
            <div className="mb-4 pb-4 border-b border-spark-rule-soft">
              <p className="text-sm font-bold text-spark-ink-soft mb-2">Let AI Spark The Script</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteAiTopic}
                  onChange={(e) => setPasteAiTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !pasteAiGenerating && handleAiWriteForPaste()}
                  placeholder="What's your Spark? Enter a topic…"
                  className="flex-1 text-sm px-3 py-2 border border-spark-rule rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
                />
                <Button
                  size="sm"
                  loading={pasteAiGenerating}
                  disabled={!pasteAiTopic.trim()}
                  onClick={handleAiWriteForPaste}
                  className="whitespace-nowrap gap-1"
                >
                  <Sparkles size={13} /> Spark It
                </Button>
              </div>
              {pasteScript && !pasteAiGenerating && (
                <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                  <CheckCircle size={11} /> Script Sparked. Review And Edit Below Before Generating.
                </p>
              )}
            </div>
            )}

            {/* Title */}
            <div className="mb-4">
              <label className="text-sm font-bold text-spark-ink-soft block mb-1">Video Title (optional)</label>
              <input
                type="text"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="e.g. Austin Market Update, June 2026"
                className="w-full text-sm px-3 py-2.5 border border-spark-rule rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
            </div>

            {/* Optional thumbnail hook */}
            <div className="mb-4">
              <label className="text-sm font-bold text-spark-ink-soft block mb-1">
                Opening Line <span className="font-normal text-spark-ink-faint">(optional)</span>
              </label>
              <input
                type="text"
                value={pasteHook}
                onChange={(e) => setPasteHook(e.target.value)}
                placeholder="e.g. Why Austin Buyers Are Moving Fast Right Now"
                className="w-full text-sm px-3 py-2.5 border border-spark-rule rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber"
              />
              <p className="text-[11px] text-spark-ink-faint mt-1">
                Spoken first, before your script. It also becomes the video&apos;s title, so the two never disagree.
              </p>
            </div>

            {/* Script textarea.
                The length of the video is not chosen here — it is picked in the
                editor — so a pasted script can't be measured against one limit.
                Both are shown, and the count says which one the script currently
                fits, rather than asserting 500 at someone writing an 8-minute
                video. Limits come from video-length.ts, not from a number typed
                in here, so they follow the caps. */}
            <div className="mb-4">
              <label className="flex items-center gap-1.5 text-sm font-bold text-spark-ink-soft mb-1">
                Your Script *
                {/* This tab had no mic at all — the one way in that was
                    typing only. Dictation appends rather than replaces: it is
                    for adding a paragraph to what is already there, and a
                    script someone pasted must never be wiped by a stray tap.

                    The words are taken down as spoken and not sent anywhere
                    to be rewritten. What this tab promises is that the avatar
                    reads the script exactly as written, and that promise has
                    to survive the script being spoken rather than typed. */}
                <FieldMic
                  title="Dictate. Adds to the end of your script"
                  // A whole script, dictated. The short window would end the
                  // turn every time you drew breath.
                  silenceMs={PROSE_SILENCE_MS}
                  onInterim={setPasteInterim}
                  onTranscript={(t) =>
                    setPasteScript((prev) => (prev.trim() ? `${prev.trimEnd()} ${t}` : t))
                  }
                />
                {pasteWordCount > 0 && (
                  <span
                    className={`ml-2 font-normal ${
                      pasteWordCount > LONG_MAX_WORDS
                        ? "text-red-500"
                        : pasteWordCount > SHORT_MAX_WORDS
                          ? "text-amber-600"
                          : "text-spark-ink-faint"
                    }`}
                  >
                    {pasteWordCount.toLocaleString()} words · ~{minutesFor(pasteWordCount)} min
                  </span>
                )}
              </label>
              <textarea
                value={pasteScript}
                onChange={(e) => setPasteScript(e.target.value)}
                placeholder={`Paste or type your script here. The AI avatar speaks it exactly as written. Up to ${SHORT_MAX_WORDS} words for a standard video, or ${LONG_MAX_WORDS.toLocaleString()} for a long one.`}
                rows={10}
                className="w-full text-sm px-3 py-2.5 border border-spark-rule rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-spark-amber resize-none leading-relaxed"
              />
              {/* Under the box rather than in it: dictation appends here, so
                  live text written into the value would land in the script if
                  a session ended unexpectedly. */}
              {pasteInterim && (
                <p className="mt-1 text-xs italic leading-snug text-spark-ink-faint">
                  {pasteInterim}
                </p>
              )}

              {pasteWordCount === 0 ? (
                <p className="text-xs text-spark-ink-faint mt-1">
                  Standard video: up to {SHORT_MAX_WORDS} words (~{minutesFor(SHORT_MAX_WORDS)} min) ·
                  Long video: up to {LONG_MAX_WORDS.toLocaleString()} words (~{minutesFor(LONG_MAX_WORDS)} min)
                </p>
              ) : pasteWordCount <= pasteScriptBudget ? (
                <p className="text-xs text-spark-ink-faint mt-1">
                  Fits {pasteIsLong ? "a long" : "a standard"} video ({pasteWordCap.toLocaleString()} words
                  max){pasteIsLong ? "." : `. Longform takes up to ${LONG_MAX_WORDS.toLocaleString()}.`}
                </p>
              ) : (
                /* One rule instead of two.
                   The offer to cut used to appear only past the long-video
                   maximum, so the ordinary case — a script too long for the
                   Shorts you actually picked — got a sentence telling you to
                   count out 712 words by hand. It is measured against the
                   length chosen above, whichever that is. */
                <div className="mt-1 flex flex-col items-start gap-1.5">
                  <p className={`text-xs flex items-start gap-1 ${pasteIsLong ? "text-red-500" : "text-amber-600"}`}>
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>
                      {pasteIsLong ? (
                        <>
                          Over the {LONG_MAX_WORDS.toLocaleString()}-word maximum even for a long video.
                          The last {(pasteWordCount - pasteScriptBudget).toLocaleString()} words will be cut
                          before rendering.
                        </>
                      ) : (
                        <>
                          Too long for a standard video. Pick <strong>Longform</strong> above, or cut{" "}
                          {(pasteWordCount - pasteScriptBudget).toLocaleString()} words to fit.
                        </>
                      )}
                    </span>
                  </p>
                  <Button
                    onClick={shortenPastedScript}
                    loading={pasteShortening}
                    variant="outline"
                    size="sm"
                  >
                    {pasteShortening
                      ? "Shortening…"
                      : `Shorten it to fit (~${pasteScriptBudget.toLocaleString()} words)`}
                  </Button>
                </div>
              )}

              {/* The closing ask is appended to the narration and counted
                  against the same cap, so a script written right up to the
                  limit loses its last sentences to make room for it — after
                  the video is made, with nothing on screen having said so. */}
              {pasteCtaWords > 0 && (
                <p className="text-[11px] text-spark-ink-faint mt-1.5">
                  Your call to action is spoken after this, adding about{" "}
                  {pasteCtaWords.toLocaleString()} words (~{minutesFor(pasteCtaWords)} min) to the
                  video. It doesn&apos;t come out of the {pasteWordCap.toLocaleString()} above. You
                  can edit it on the next step.
                </p>
              )}
            </div>

            {/* Photos only. Optional, and an output rather than an input — they
                become b-roll over a script that already exists — so they sit
                after it. The way IN moved to the top of this card, next to the
                choice of how to start. */}
            <div className="mt-4 pt-4 border-t border-spark-rule-soft">
              <MediaAndDocs
                photos={pastePhotos}
                onAddPhotos={handlePastePhotosUpload}
                onRemovePhoto={removePastePhoto}
                onReorderPhotos={(from, to) => setPastePhotos((p) => reorder(p, from, to))}
                photosUploading={pastePhotoUploading}
                // Says plainly what the fallback is. Stock footage is a free
                // general-purpose library — it has clips of houses, not clips
                // of your township — so photos are the only b-roll that shows
                // the actual place the script is about. Left unsaid, the stock
                // clips read as a broken attempt at local footage rather than
                // as the generic filler they are.
                blurb="Photos become b-roll in the video. Your own are the only footage that shows your actual area — without them we fall back to generic stock."
              />
            </div>
          </Card>

          {/* The button itself is in the fixed footer — this column is long
              enough that the primary action was below the fold on arrival. */}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LISTING TAB
      ══════════════════════════════════════════ */}
      {inputMode === "listing" && (
        <div className="grid lg:grid-cols-2 gap-3 items-start">
          <Card padding="sm" className="p-3 min-w-0 border-t-4 border-t-emerald-500">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-gradient-to-br from-spark-amber to-spark-amber-glow rounded-xl flex items-center justify-center shadow-sm">
                <Building2 size={17} className="text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-brand-text">
                  {blogOnly ? "Property Article" : listingMode === "reel" ? "Photo Reel" : "Listing Video"}
                </p>
                <p className="text-sm text-spark-ink-muted">
                  {blogOnly
                    ? "Import from Zillow · Upload photos · Enter manually"
                    : listingMode === "reel"
                      ? "Your photos, Ken Burns, and music or your voice · free, nothing from your plan"
                      : "Upload Photos · Import From Zillow · Enter Manually"}
                </p>
              </div>
            </div>

            {/* Two things you can make from the same listing: a scripted tour
                that renders with your avatar or voice, and a reel built
                straight out of the photos. They share this tab because they
                share their input — a set of property pictures.
                Not on the blog route: a reel is a video, and this card sat
                directly under "No video will be made". */}
            {!blogOnly && (
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {([
                { key: "listing" as const, label: "Listing video", sub: "we write the tour" },
                { key: "reel" as const, label: "Photo reel", sub: "photos into a video · free" },
              ]).map(({ key, label, sub }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setListingMode(key)}
                  aria-pressed={listingMode === key}
                  className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    listingMode === key
                      ? "border-spark-amber bg-spark-amber-tint"
                      : "border-spark-rule bg-white hover:border-spark-rule-dim"
                  }`}
                >
                  <span className="block text-[12px] font-bold text-brand-text">{label}</span>
                  <span className="block text-[10.5px] text-spark-ink-muted">{sub}</span>
                </button>
              ))}
            </div>
            )}

            {/* The reel starts from whatever the Listing form has gathered.
                Both live under this one tab and read as two ways to use the
                same listing, but the reel could only see photos uploaded into
                its own grid — so importing a Zillow URL left the one feature
                built to turn photos into a video unable to see them.
                Kept mounted only while selected, so each switch is a fresh
                mount that re-reads the listing's current photos. */}
            {listingMode === "reel" && !blogOnly && (
              <PhotoReelForm
                city={locCity || undefined}
                state={locState || undefined}
                initialPhotos={listingPhotos}
                initialAddress={listingAddress}
              />
            )}
            {/* "Read it myself on camera" crosses to the camera tab rather
                than the editor's teleprompter. Only this tab's recorder
                composites photos, and the rehost below is what makes that
                possible at all: a canvas cannot record a third-party image,
                so scraped listing photos have to be copied into our storage
                first or the recording fails outright. */}
            {(listingMode === "listing" || blogOnly) && (
            <ListingVideoForm
              blogOnly={blogOnly}
              onListingPhotos={(photoUrls, address) => {
                setListingPhotos(photoUrls);
                setListingAddress(address);
              }}
              onRecordYourself={async (script, photoUrls) => {
                setCameraGeneratedScript(script);
                setInputMode("camera");
                window.scrollTo({ top: 0, behavior: "smooth" });
                if (photoUrls.length === 0) return;
                const safe = await rehostPhotos(photoUrls.slice(0, 12));
                setCameraPhotos(
                  safe.map((url, i) => ({ url, name: `Listing photo ${i + 1}`, preview: url })),
                );
              }}
            />
            )}
          </Card>

          {/* What you get — keeps the right column balanced.
              Two lists, because there are two things under this tab. This was
              written when there was only the listing video, and the reel was
              added underneath it without the panel ever learning: with Photo
              reel selected it promised an AI script, an avatar, a logo and
              Fair-Housing wording, none of which a reel has, and tipped the
              Zillow import, which is not even mounted in that mode. */}
          <Card padding="sm" className="p-3 min-w-0 lg:sticky lg:top-4 border-t-4 border-t-spark-blue">
            <p className="text-base font-bold text-brand-text mb-3">
              {blogOnly
                ? "What Your Property Article Includes"
                : listingMode === "reel" ? "What Your Photo Reel Includes" : "What Your Listing Video Includes"}
            </p>
            {/* A third list for the blog route, which had been showing the
                listing video's — b-roll, a narrator, an avatar — beside a card
                headed "Property Article" and under "No video will be made". */}
            <ul className="text-sm text-spark-ink-soft space-y-2.5">
              {blogOnly ? (<>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Usually 800 to 1,200 words with headings, ready to paste into your site</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Written from the listing: price, beds, baths and standout features</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Fair Housing-safe wording</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Title, description &amp; hashtags for publishing</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Nothing spent. Turn it into a video afterwards if you want one</li>
              </>) : listingMode === "reel" ? (<>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your photos in the shape you pick, with Ken Burns motion and dissolves between them</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Music only, your cloned voice reading a script you write, or a recording of you</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Text cards on the photos you write one for, and captions burned in if you want them</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> A closing card with your ask, the property and your phone number</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Title, description &amp; hashtags auto-generated for publishing</li>
              </>) : (<>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your listing photos as cinematic b-roll with Ken Burns motion</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> AI script highlighting price, beds/baths, and standout features</li>
                {/* Stated unconditionally until the form grew a Who's On Screen
                    choice — on Voice only there is no avatar at all, which is
                    the better option for a tour where the photos carry it. */}
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your cloned voice narrating. With your AI avatar on screen, or the photos full-frame</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Your logo, contact card, and Fair-Housing-safe wording built in</li>
                <li className="flex items-start gap-2"><CheckCircle size={15} className="text-spark-amber mt-0.5 shrink-0" /> Title, description &amp; hashtags auto-generated for publishing</li>
              </>)}
            </ul>
            <p className="text-sm text-spark-ink-faint mt-3 pt-3 border-t border-spark-rule-soft">
              {blogOnly
                ? "Tip: Zillow import fills in the details in seconds. Just paste the listing URL."
                : listingMode === "reel"
                  ? "Tip: photo 1 opens the reel. Use the arrows to put your strongest shot first."
                  : "Tip: Zillow import fills everything in seconds. Just paste the listing URL."}
            </p>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CAMERA TAB

          One card, one top-to-bottom order: market → photos → script →
          prompter → branded look → record. Split across two columns this read
          as two competing forms. Width is capped so the script and tips don't
          stretch into unreadable lines on a wide monitor.
      ══════════════════════════════════════════ */}
      {inputMode === "camera" && step === "input" && (
        <div className="mt-7 max-w-3xl">
          {/* No eyebrow of its own. This tab's card carries two numbered
              sections inside it — 3 and 4, continuing the page's count — so a
              third amber label above them naming the tab and the step would
              have been a heading for a heading. */}
          <Card padding="sm" className="p-3 min-w-0 border-t-4 border-t-emerald-500">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 bg-gradient-to-br from-spark-amber to-spark-amber-glow rounded-xl flex items-center justify-center shadow-sm">
                <Video size={17} className="text-white" />
              </div>
              <div>
                {/* The card used to be headed "Your script" whatever was in
                    it — including the clip brander, which has no teleprompter
                    and, on the keep-the-audio route, no script at all. */}
                <p className="text-base font-bold text-brand-text">
                  {cameraMode === "brand" && canBrandClips ? "Your footage" : "Your script"}
                </p>
                <p className="text-sm text-spark-ink-muted">
                  {/* The subtitle promised the script while the first control
                      under it asked about the picture. It now describes the
                      screen: write it, then set up the take. */}
                  {cameraMode === "brand" && canBrandClips
                    ? "Add your branding to a clip you already shot"
                    : "First we write it, then you set up the take"}
                </p>
              </div>
            </div>

            {/* ── Spoken brief ──
                The camera tab's only AI path was "write from my uploads", so
                an agent with nothing to upload had no way to get a script.
                Speaking one fills the market above and writes the
                teleprompter. Same session component and endpoint as the
                AI-writes-it tab — the brief is the same brief. */}
            {/* Record here, or brand something already shot. Only offered on
                a desktop — see canBrandClips. */}
            {canBrandClips && cameraPhase === "script" && (
              <div className="mb-4">
                {/* Labelled, because this row sits directly under a heading
                    about the script and is not about the script at all. */}
                <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">
                  Where the picture comes from
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                {([
                  // Both subs now answer the same question — what you end up
                  // filming. One described a feature and the other a size
                  // limit, which made them look like different kinds of thing.
                  { key: "record" as const, label: "Record it here", sub: "you, on camera, now" },
                  // Was "Upload my footage", which collided with Branded
                  // Look's "Play my footage behind me" further down the same
                  // screen. Both said "my footage" and meant opposite things:
                  // this one makes the clip the video, that one makes it the
                  // background while you present over it.
                  { key: "brand" as const,  label: "Brand a clip I already shot", sub: "your footage, with your logo burned in · up to 2 min" },
                ]).map(({ key, label, sub }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCameraMode(key)}
                    aria-pressed={cameraMode === key}
                    className={`px-2.5 py-2 rounded-lg border text-left transition-colors ${
                      cameraMode === key
                        ? "border-spark-amber bg-spark-amber-tint"
                        : "border-spark-rule bg-white hover:border-spark-rule-dim"
                    }`}
                  >
                    <span className="block text-[12px] font-bold text-brand-text">{label}</span>
                    <span className="block text-[10.5px] text-spark-ink-muted">{sub}</span>
                  </button>
                ))}
                </div>
              </div>
            )}

            {cameraMode === "brand" && canBrandClips ? (
              <ClipBrander
                photos={cameraPhotos.map((p) => p.url)}
                title={locCity ? `${locCity} clip` : "Camera clip"}
              />
            ) : (<>

            {cameraPhase === "script" && (<>
            {/* "Where your script comes from" used to be asked here, a level
                below the tab that had already been chosen. It is row 2 at the
                top of the page now — the same control, asked once. Two
                uploads still live on this screen and they do opposite things:
                the one above keeps your footage and publishes it, the one row
                2 calls "a recording of me talking" throws the file away and
                keeps only the words. */}

            {/* ── What the script gets written from ──
                Everything above the writing happens here, in the order the
                writer reads it: where, how long, what about, and what it has
                to work with. The market and the length used to sit BELOW the
                button that writes — the length four sections below, inside
                "Your teleprompter" — so the script was written to whatever
                the default was and the picker you scrolled past afterwards
                did nothing until you regenerated it. */}
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-spark-amber">
              3 · What we&rsquo;re writing
            </p>

            {/* Market for THIS video. Without it the CTA and end card silently
                fell back to the profile's home city — a Willow Grove listing
                went out saying Blue Bell. Above the brief now: the spoken
                brief fills it in as you talk, so watching it populate is the
                confirmation that we heard the town right. */}
            <div className="mb-3">
              <p className="text-xs font-semibold text-spark-ink-muted uppercase tracking-wide mb-1.5">
                Market For This Video
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={locCity}
                  onChange={(e) => setLocCity(e.target.value)}
                  placeholder="City"
                  className="flex-1 min-w-0 text-sm px-3 py-2 border border-spark-rule rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={locState}
                  onChange={(e) => setLocState(toStateAbbr(e.target.value))}
                  placeholder="ST"
                  maxLength={2}
                  className="w-16 shrink-0 text-sm px-3 py-2 border border-spark-rule rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                />
              </div>
              <p className="text-xs text-spark-ink-faint mt-1">
                Used by your channel CTA and the end card. Set it to the property&apos;s town, not your office.
              </p>
            </div>

            {/* Only where something is about to be written to this length. On
                the transcribe and type-it-yourself routes the length is
                whatever you said or wrote, so a picker there would be a
                setting that changes nothing. */}
            {(cameraSource === "speak" || cameraSource === "uploads") && (
              <div className="mb-3">
                <ScriptLengthPicker
                  value={cameraScriptLength}
                  onChange={setCameraScriptLength}
                  disabled={cameraScriptGenerating}
                  hint="How long the AI writes for. Recording is free, so pick whatever the subject needs."
                />
              </div>
            )}

            {cameraSource === "speak" && (
            <div className="mb-4">
                {/* Named, because it is not the script. Unlabelled, a box
                    saying "Say it or type it" sat directly above a second box
                    saying "Your Script" — two empty boxes on one screen, both
                    apparently wanting the words you are going to say. This one
                    wants the topic; the one below holds what gets written. */}
                <p className="text-xs font-semibold text-spark-ink-muted uppercase tracking-wide mb-1">
                  Tell Us The Topic
                </p>
                <p className="mb-2 text-xs text-spark-ink-faint">
                  Say or type what the video is about — a sentence is enough. The
                  AI writes the script from it and loads it into your
                  teleprompter below.
                </p>
                <VoiceBriefSession
                  disabled={cameraScriptGenerating}
                  onSwitchToTyping={() => { /* the box already takes typing */ }}
                  onSlots={(sl) => {
                    if (sl.city) setLocCity(sl.city);
                    if (sl.state) setLocState(sl.state);
                    if (sl.topic) setCameraVoiceTopic(sl.topic);
                    // The brief speaks in standard/long; the teleprompter has
                    // four lengths. Map onto the nearest and leave the
                    // four-way picker for anything finer.
                    if (sl.length) setCameraScriptLength(sl.length === "long" ? "full" : "standard");
                  }}
                  onReady={(sl) => handleCameraScriptFromTopic(sl.topic ?? cameraVoiceTopic, sl)}
                />
            </div>
            )}

            {/* The audio a recording already exists in — transcribed into a
                script. It used to live below Open Camera, under the tips
                list, at the bottom of the page: a way IN, placed after the
                way out. */}
            {cameraSource === "audio" && (
              <div className="mb-4">
                <VoiceUploader onFileSelected={handleFileSelected} />
              </div>
            )}

            {/* Photos & docs. Sits above the script because it feeds it — the AI
                  writes from these, and they become the b-roll. */}
            <div className="mb-4 rounded-xl border border-spark-rule p-3.5">
              {/* First in the box, above the photos. On this route the
                  attachment IS the script — the button below writes from it —
                  while the photos are what plays behind you afterwards. */}
              {cameraSource === "uploads" && (
                <ArticleSource
                  doc={{
                    mode: cameraPdfMode,
                    onModeChange: setCameraPdfMode,
                    attached: !!cameraPdfUrl,
                    attachedName: cameraPdfName,
                    onClear: () => {
                      setCameraPdfUrl(""); setCameraPdfText(""); setCameraPdfName(""); setCameraPdfUrlInput("");
                    },
                    uploading: cameraPdfUploading,
                    onUploadPdf: handleCameraPdfUpload,
                    urlInput: cameraPdfUrlInput,
                    onUrlInputChange: setCameraPdfUrlInput,
                    onFetchUrl: handleCameraUrlExtract,
                    fetching: cameraPdfUrlExtracting,
                    onPickEmail: handleCameraEmailPick,
                  }}
                />
              )}
              <MediaAndDocs
                photos={cameraPhotos}
                onAddPhotos={handleCameraPhotosUpload}
                onRemovePhoto={removeCameraPhoto}
                onReorderPhotos={(from, to) => setCameraPhotos((p) => reorder(p, from, to))}
                photosUploading={cameraPhotoUploading}
                // Photos are no longer the only thing that can fill the frame
                // behind you, and the video option lives in a different panel
                // — so this says where to find it rather than leaving someone
                // to conclude it does not exist.
                blurb="Photos fill the screen as b-roll while you record. You stay on camera in the corner. To play a video behind you instead, use Branded Look further down."
              />

              {/* A sub-action of this card, styled like one. Full-width and
                  filled, it read as the step's primary and competed with Open
                  Camera further down — three buttons on the screen looked
                  equally like the next thing to press. */}
              {cameraSource === "uploads" && (cameraPdfText || cameraPhotos.length > 0) && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    loading={cameraScriptGenerating}
                    onClick={handleGenerateScriptFromCameraUploads}
                    className="gap-1.5"
                  >
                    {cameraScriptGenerating
                      ? <><Loader2 size={13} className="animate-spin" /> Generating Script…</>
                      : <><Sparkles size={13} /> Write the script from these</>}
                  </Button>
                  <p className="text-[11px] text-spark-ink-faint mt-1.5">Loads into your teleprompter below.</p>
                </div>
              )}
            </div>
            </>)}

            {/* ── How it records ──
                The line the page was missing. Above it, everything that
                changes what gets WRITTEN; below it, everything that changes
                what gets FILMED — and none of the second half means anything
                until the first half has produced a script. Stated rather than
                implied, because eleven unlabelled sections in a row read as
                eleven equally urgent things rather than two halves. */}
            {cameraPhase === "script" && (
              <p className="mb-2 mt-5 border-t border-spark-rule-soft pt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-spark-amber">
                4 · How it records
              </p>
            )}

            <CameraRecorder
              onPhaseChange={setCameraPhase}
              city={locCity || undefined}
              state={locState || undefined}
              initialScript={cameraGeneratedScript || undefined}
              initialUnbranded={cameraUnbranded}
              freestyle={cameraSource === "freestyle"}
              // The spoken brief and the write-from-uploads button are both on
              // this page, above. Without this the recorder drew its own
              // "Spark with AI" panel underneath them — a second topic box for
              // the same script.
              scriptSourceAbove={cameraSource === "speak" || cameraSource === "uploads"}
              scriptLength={cameraScriptLength}
              onScriptLengthChange={setCameraScriptLength}
              photos={cameraPhotos.map((p) => p.url)}
            />
            </>)}

          </Card>

        </div>
      )}

      {/* ── Shared processing states (uploading / transcribing / done) ── */}
      {(inputMode === "script" || inputMode === "camera") && step !== "input" && (
        <>
          {/* Progress */}
          <div className="flex items-center gap-2 mb-6">
            {(["input", "uploading", "transcribing", "done"] as Step[]).map((s, i, arr) => {
              const steps: Step[] = ["input", "uploading", "transcribing", "done"];
              const labels = ["Input", "Uploading", "Transcribing", "Ready"];
              const ci = steps.indexOf(step), ti = steps.indexOf(s);
              const isActive = ti === ci, isDone = ti < ci;
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${isActive ? "text-spark-blue" : isDone ? "text-spark-amber" : "text-spark-rule-dim"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? "bg-spark-amber text-white" : isDone ? "bg-spark-amber text-white" : "bg-spark-rule text-spark-ink-faint"}`}>
                      {isDone ? <CheckCircle size={12} /> : i + 1}
                    </span>
                    <span className="hidden sm:inline">{labels[i]}</span>
                  </div>
                  {i < arr.length - 1 && <div className={`h-px w-8 ${isDone ? "bg-emerald-400" : "bg-spark-rule"}`} />}
                </div>
              );
            })}
          </div>

          {step === "uploading" && (
            <Card className="flex flex-col items-center py-12 gap-4 text-center">
              <div className="w-14 h-14 bg-spark-blue/10 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-spark-blue animate-spin" />
              </div>
              <div>
                {/* A video spends this step being decoded in the browser, not
                    uploaded — saying "uploading" over a file that has not left
                    the machine reads as a stalled upload. */}
                <p className="font-semibold text-brand-text">
                  {uploadedFile && isVideoFile(uploadedFile)
                    ? "Reading The Speech From Your Video…"
                    : "Uploading Your Recording…"}
                </p>
                <p className="text-sm text-spark-ink-faint mt-1">
                  {uploadedFile && isVideoFile(uploadedFile)
                    ? "The footage stays on your machine. Only the words are sent"
                    : "Securely Storing Your Audio"}
                </p>
              </div>
              <Skeleton className="h-1.5 w-48" />
            </Card>
          )}

          {step === "transcribing" && (
            <Card className="flex flex-col items-center py-12 gap-4 text-center">
              <div className="w-14 h-14 bg-spark-amber-tint rounded-2xl flex items-center justify-center">
                <FileText className="w-7 h-7 text-spark-amber animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-brand-text">Transcribing Your Voice…</p>
                <p className="text-sm text-spark-ink-faint mt-1">Converting Speech To Text</p>
              </div>
              <Skeleton className="h-1.5 w-40" />
            </Card>
          )}

          {step === "done" && (
            <div className="flex flex-col gap-4">
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-spark-amber" />
                  <h3 className="font-semibold text-brand-text">Transcript Ready</h3>
                  <span className="ml-auto text-xs text-spark-ink-faint">{transcript.split(" ").length} words</span>
                </div>
                <div className="bg-spark-paper rounded-xl p-4 max-h-52 overflow-y-auto">
                  <p className="text-sm text-spark-ink-soft leading-relaxed whitespace-pre-wrap">
                    {transcript || "No Transcript Generated. Please Try Again."}
                  </p>
                </div>
              </Card>
              <Button onClick={handleGenerateVideo} size="lg" className="w-full gap-2">
                Generate My Video <ArrowRight size={16} />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Error for mic/audio */}
      {false && (
        <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>Microphone error. Please check your browser permissions.</p>
        </div>
      )}

    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<div className="max-w-xl mx-auto h-64 animate-pulse bg-spark-rule-soft rounded-2xl" />}>
      <CreatePageInner />
    </Suspense>
  );
}
