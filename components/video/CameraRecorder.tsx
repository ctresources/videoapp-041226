"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CAMERA_LENGTHS, type CameraLength } from "@/lib/utils/video-length";
import {
  Camera,
  Square,
  RotateCcw,
  Download,
  Play,
  Pause,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  Video,
  Share2,
  Lightbulb,
  Megaphone,
  Film,
} from "lucide-react";
import toast from "react-hot-toast";
import { showTrialLock } from "@/lib/utils/trial-lock";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { resolveCta } from "@/lib/utils/default-cta";
import { uploadCameraRecording, videoTypeForSize, videoExtensionForType } from "@/lib/utils/camera-upload";
import { useAuth } from "@/providers/supabase-provider";
import {
  newRecoveryId,
  putRecovery,
  updateRecovery,
  deleteRecovery,
  listRecoveries,
  downloadRecovery,
  isMemoryOnly,
  describeAge,
  describeSize,
  STAGE_LABELS,
  type UploadStage,
  type RecoveryRecord,
} from "@/lib/utils/pending-upload";
import { pickRecordingMimeType, recordedType } from "@/lib/utils/recording-format";
import { micErrorMessage, useMicrophoneDevices, useStreamLevel } from "@/lib/hooks/use-microphone";
import { BrandedComposite } from "@/lib/utils/branded-recorder";
import { VoiceFollower, LiveTranscriber, isVoiceFollowSupported, followWordInContainer } from "@/lib/utils/voice-follow";
import { PublishModal } from "@/components/social/PublishModal";
import { FieldMic } from "@/components/ui/field-mic";
import { TopicRadar } from "@/components/create/topic-radar";

type CamStep = "script" | "camera" | "done";

/**
 * The two shapes, and how to hold the phone for each.
 *
 * The tip is the point: choosing horizontal while holding the phone upright
 * crops the middle out of a portrait frame, which takes the top of your head
 * and everything below your chest. The choice is only useful next to the
 * instruction that makes it work.
 */
const SHAPES = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
} as const;

const SHAPE_META = [
  {
    key: "vertical" as const,
    label: "Vertical",
    ratio: "9:16",
    where: "Reels, Shorts + TikTok",
    tip: "Hold your phone upright, the way you normally would.",
  },
  {
    key: "horizontal" as const,
    label: "Horizontal",
    ratio: "16:9",
    where: "YouTube + websites",
    tip: "Turn your phone sideways before you start — on a laptop you are already there.",
  },
];

const SPEED_OPTIONS = [
  { label: "Slow", px: 12 },
  { label: "Medium", px: 24 },
  { label: "Fast", px: 42 },
];

// YouTube requires phone verification to upload videos longer than 15 minutes,
// so recordings are capped at 15:00 to keep every video publishable.
const MAX_RECORD_SECONDS = 15 * 60;
const WARN_RECORD_SECONDS = 13 * 60;

// Music beds for Branded Look. These were hardcoded Mixkit URLs that had all
// gone 403 — the editor hit the same problem and moved to HeyGen's licensed
// catalog, which is what these queries resolve against. Served through our own
// origin because WebAudio outputs silence for audio it can't read under CORS.
const MUSIC_OPTIONS = [
  { id: "none",      label: "No Music",   query: null as string | null },
  { id: "calm",      label: "Calm Piano", query: "calm gentle piano background music" },
  { id: "corporate", label: "Upbeat",     query: "upbeat corporate motivational background music" },
  { id: "inspiring", label: "Inspiring",  query: "inspiring uplifting cinematic background music" },
];

function musicUrlFor(id: string): string | null {
  const query = MUSIC_OPTIONS.find((m) => m.id === id)?.query;
  return query ? `/api/music/track?q=${encodeURIComponent(query)}` : null;
}

// How long the branded end card holds after Stop before the file is finalized
const END_CARD_MS = 3200;

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export function CameraRecorder({ city, state, initialScript, initialUnbranded = false, freestyle = false, scriptSourceAbove = false, scriptLength, onScriptLengthChange, photos = [], onPhaseChange, micTools = true }: {
  city?: string; state?: string; initialScript?: string;
  /**
   * No script at all — you talk, we keep what you said.
   *
   * The teleprompter is the whole reason this component asks for a script, so
   * turning it off turns off everything that serves it: the script box, the
   * Spark panel, the scroll-mode picker and the overlay while recording. The
   * recording itself, the branding and the transcribe-and-continue step after
   * it are identical either way.
   */
  freestyle?: boolean;
  /**
   * The page above already owns the AI writer.
   *
   * On the camera tab the route is chosen before this component renders, and
   * "AI writes it" and "From a document" each put their own writer on the
   * page — a spoken brief, or a "write the script from these" button. This
   * component then drew a second one: a "Spark with AI" panel with its own
   * topic box, directly under the first. Two empty boxes, both asking what
   * the video is about, and nothing saying which one wrote the script.
   *
   * So on those routes the writer here folds away and the box below is only
   * what it has always actually been — the teleprompter, holding whatever was
   * written above, editable before you record. The length picker stays: it
   * sets the length the page's own writer uses.
   */
  scriptSourceAbove?: boolean;
  /**
   * Start with the MLS unbranded cut already on, because the editor's
   * checkbox said so. Without it that choice died at the tab boundary and the
   * recorder began from its own default of off.
   */
  initialUnbranded?: boolean;
  /** The teleprompter script length, owned by the page — see sparkLength. */
  scriptLength: CameraLength;
  onScriptLengthChange: (l: CameraLength) => void;
  /** Photo URLs used as b-roll behind the speaker. Must be CORS-clean — see
   *  /api/photos/rehost — or they are silently dropped at load. */
  photos?: string[];
  /**
   * Which of this component's own phases is showing.
   *
   * The page above renders the market field, the uploads card and the doc/URL
   * attach permanently, so once the camera opened — and again once a take had
   * been recorded — all of that setup was still sitting above the result. The
   * page uses this to fold the setup away while the camera has the screen.
   */
  onPhaseChange?: (phase: CamStep) => void;
  /**
   * The shared microphone tools, and the shape fail-safe that came with them:
   * a picker, a live meter, a pre-flight check, the exact output stated in
   * pixels, and a refusal to record a shape other than the one on screen.
   *
   * On everywhere since both shapes were tested on 2026-09-11. Kept as a prop
   * only as an escape hatch — no screen passes false.
   */
  micTools?: boolean;
}) {
  const [step, setStep] = useState<CamStep>("script");
  const [script, setScript] = useState(initialScript ?? "");

  useEffect(() => {
    if (initialScript) setScript(initialScript);
  }, [initialScript]);

  /**
   * What the teleprompter reads, which is nothing on the freestyle route.
   *
   * Derived rather than clearing `script`: someone who sparked a script, then
   * decided to wing it, then changed their mind again would otherwise find
   * their words gone. Switching the choice hides the script; it never eats it.
   */
  const promptScript = freestyle ? "" : script;

  useEffect(() => {
    onPhaseChange?.(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const [showSpark, setShowSpark] = useState(false);
  const [sparkTopic, setSparkTopic] = useState("");
  // Camera recordings are free and run up to 15 min, so script length is purely
  // the agent's choice — the AI used to always write ~2-3 minutes.
  /**
   * Lifted to the page.
   *
   * This used to be the recorder's own state, read only by its Spark button —
   * so the four-way picker the user sees had no effect at all on row 2's "AI
   * writes it" or "From a document", which always asked for 435 words. One
   * picker, one value, whichever route writes the script.
   */
  const sparkLength = scriptLength;
  const setSparkLength = onScriptLengthChange;
  const [sparking, setSparking] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  // "flow" = teleprompter follows the reader's voice; "auto" = constant speed
  const [scrollMode, setScrollMode] = useState<"auto" | "flow">("auto");
  const [flowSupported, setFlowSupported] = useState(false);
  const followerRef = useRef<VoiceFollower | null>(null);
  // Branded Look — record-time compositing (logo, name bar, captions, music,
  // end card). Defaults on: most recordings should carry the agent's branding
  // without having to remember to switch it on. Off falls back to the plain
  // recording path.
  const [brandedLook, setBrandedLook] = useState(true);
  /**
   * The shape to record in.
   *
   * Nothing used to choose this: the canvas copied whatever the camera gave
   * it, so a phone held upright produced 9:16 and a laptop 16:9, and the
   * format was a by-product of how you happened to be holding the device.
   * Vertical by default because that is where a property reel goes.
   */
  const [shape, setShape] = useState<"vertical" | "horizontal">("vertical");
  /** What the camera is actually handing us, so we can tell you to rotate. */
  const [camLandscape, setCamLandscape] = useState<boolean | null>(null);
  /**
   * The shared microphone tools, when micTools is on.
   *
   * The meter reads the camera stream's own audio track — the camera asks for
   * video and audio in one prompt, and a second microphone stream is what iOS
   * punishes. Every one of these is inert when micTools is off.
   */
  const { devices: mics, preferredId, setPreferredId, refresh: refreshMics } = useMicrophoneDevices();
  const [micId, setMicId] = useState<string | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const { level: micLevel, clipping: micClipping, heard: micHeardLive } = useStreamLevel(micStream);
  const [micHeard, setMicHeard] = useState(false);
  useEffect(() => { if (micHeardLive) setMicHeard(true); }, [micHeardLive]);
  useEffect(() => { setMicId(preferredId); }, [preferredId]);
  const [brandedSupported, setBrandedSupported] = useState(false);
  /**
   * The unbranded cut most MLS boards require of listing media.
   *
   * Not the same as turning Branded Look off: captions, music and photo b-roll
   * all survive, because none of them identify the agent. What goes is the
   * logo, the name bar, the licence and the contact end card — and the spoken
   * call to action, which the script generator is told to leave out.
   */
  const [unbranded, setUnbranded] = useState(initialUnbranded);

  // The editor's checkbox can arrive after this component mounts, because the
  // page reads it out of sessionStorage in an effect.
  useEffect(() => {
    if (initialUnbranded) setUnbranded(true);
  }, [initialUnbranded]);
  const [liveCaptions, setLiveCaptions] = useState(true);
  // Photos fill the frame while the speaker stays on in a corner. On by
  // default when photos exist — that's why they were uploaded.
  const [useBroll, setUseBroll] = useState(true);
  /**
   * Footage of your own playing behind you, instead of the photos.
   *
   * The last combination in the matrix: your clip fills the frame while you
   * present in the corner. Held as an object URL because that is what the
   * composite can draw without tainting the canvas — a remote URL would make
   * the whole recording unreadable, not just the background.
   */
  const [brollVideoUrl, setBrollVideoUrl] = useState<string | null>(null);
  const [brollVideoName, setBrollVideoName] = useState("");
  useEffect(() => () => {
    if (brollVideoUrl) URL.revokeObjectURL(brollVideoUrl);
  }, [brollVideoUrl]);
  const [musicId, setMusicId] = useState("none");
  const [brandedActive, setBrandedActive] = useState(false);
  const compositeRef = useRef<BrandedComposite | null>(null);
  /**
   * Why the composite is not running, when it was wanted.
   *
   * A take recorded without it comes out in the camera's own shape, which is
   * how a vertical choice produced a horizontal file with nothing on screen
   * saying so. With micTools on, this blocks the take instead.
   */
  const [compositeFailure, setCompositeFailure] = useState<string | null>(null);
  /** The user has seen the problem and chosen to record horizontal anyway. */
  const [rawShapeApproved, setRawShapeApproved] = useState(false);
  /**
   * A vertical take with no composite would be a horizontal file. Only the
   * hidden page enforces this for now — the Camera tab is unchanged.
   */
  const shapeUnsafe = micTools && shape === "vertical" && !brandedActive && !rawShapeApproved;
  /**
   * The take's real pixel shape, captured while the camera is still open.
   *
   * The upload runs from an effect on the finished blob, by which point
   * onstop has already called closeCamera() — the composite is destroyed and
   * the camera track has ended, so neither can be asked any more. Without a
   * shape the save route falls back to a 9:16 reel, which is how a 1920x1080
   * webcam take ended up playing letterboxed inside a portrait frame.
   */
  const recordedSizeRef = useRef<{ width: number; height: number } | null>(null);
  /**
   * The same facts, in state, for the done screen to render from.
   *
   * A ref does not re-render, and both of these are captured in onstop —
   * where closeCamera() then sets brandedActive back to false. Reading either
   * during render would show a stale shape on a second take, and would call
   * every branded take "raw camera".
   */
  const [takeShape, setTakeShape] = useState<{ width: number; height: number; branded: boolean } | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const stoppingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Recordings on this device whose upload has not been confirmed.
   *
   * Scoped to the signed-in user by the store itself — a shared office
   * computer must never offer one agent's unfinished take to the next person
   * to sign in.
   */
  const [recoveries, setRecoveries] = useState<RecoveryRecord[]>([]);
  /** Which held recording is uploading right now, if any. */
  const [retryingId, setRetryingId] = useState<string | null>(null);
  /**
   * The browser refused to keep a recovery copy — private mode, a full disk,
   * site data blocked. The upload still goes ahead; what changes is what we
   * are allowed to promise about closing the page.
   */
  const [storeUnavailable, setStoreUnavailable] = useState(false);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
  /** The project behind the take — the way through to its Share Kit. */
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  /**
   * What each take saved as, keyed by its recovery id.
   *
   * savedVideoId is whichever take saved LAST, and this screen shows whichever
   * take you are looking at. With two takes that meant a failed one inheriting
   * the previous take's success: the screen said Saved to My Content, offered
   * View it, and hid the warning — over a recording that had not been saved.
   */
  const [savedByRecovery, setSavedByRecovery] = useState<
    Record<string, { videoId: string; projectId: string | null; title: string }>
  >({});
  /** 3, 2, 1 — null when not counting. */
  const [countdown, setCountdown] = useState<number | null>(null);
  /**
   * Mirror the PREVIEW only.
   *
   * Reading yourself unmirrored is disorienting — you lean left and the
   * picture leans right. The recording must never be flipped, though: mirrored
   * footage reverses signage, logos and anything written in the room. Branded
   * mode has always shown the true composite, so this only offers the choice
   * where the preview is the raw camera.
   */
  const [mirrorPreview, setMirrorPreview] = useState(true);
  /** Average luminance of the preview, 0–1. Null until first sampled. */
  const [brightness, setBrightness] = useState<number | null>(null);
  /**
   * Every take from this session, newest last.
   *
   * Recording again used to replace the preview, so comparing two takes meant
   * going to My Content and back. They are all saved either way — this is about
   * being able to look at them here before deciding.
   */
  const [takes, setTakes] = useState<{ url: string; blob: Blob; seconds: number }[]>([]);
  /**
   * Each take's recovery id, which is also the server's idempotency key.
   *
   * Minted when the take comes into existence and kept for as long as the blob
   * does, so every retry of the same recording carries the same id and the
   * server can recognise it rather than saving it twice. Keyed on the blob so
   * a second take gets its own id instead of overwriting the first.
   */
  const recoveryIdsRef = useRef(new WeakMap<Blob, string>());
  /** In-flight save per recovery id, so two callers share one attempt. */
  const inFlightRef = useRef(new Map<string, Promise<{ videoId: string; alreadySaved: boolean } | null>>());
  const [viewingTake, setViewingTake] = useState(0);
  /** View it is a full page navigation, and the second or two before My Content
   *  paints looked like a link that had not registered the tap. */
  const [openingVideo, setOpeningVideo] = useState(false);
  const [savedTitle, setSavedTitle] = useState("Camera Recording");
  const [showPublish, setShowPublish] = useState(false);
  const [ctaProfile, setCtaProfile] = useState<{
    full_name: string | null; company_name: string | null;
    location_city: string | null; location_state: string | null;
    default_cta: string | null; market_years: string | null;
    avatar_url: string | null; logo_url: string | null;
    license_number: string | null; phone: string | null;
  } | null>(null);

  /** Who the held recordings belong to. The store refuses to file one without it. */
  const { user } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  // Held between openCamera() and the camera step mounting its <video>.
  const previewStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const teleRef = useRef<HTMLDivElement>(null);
  const scrollPosRef = useRef(0);
  const speedRef = useRef(SPEED_OPTIONS[1].px);

  useEffect(() => {
    speedRef.current = SPEED_OPTIONS[speedIdx].px;
  }, [speedIdx]);

  // Default to Flow when the browser supports it — it's the better experience
  useEffect(() => {
    if (isVoiceFollowSupported()) {
      setFlowSupported(true);
      setScrollMode("flow");
    }
    setBrandedSupported(BrandedComposite.isSupported());
  }, []);

  // Load the user's default CTA + profile details for the "Add Channel CTA" button
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, company_name, location_city, location_state, default_cta, market_years, avatar_url, logo_url, license_number, phone")
          .eq("id", user.id)
          .single();
        if (data) setCtaProfile(data as typeof ctaProfile);
      } catch { /* CTA button simply stays hidden */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Resolves the user's default CTA against this video's market + profile. */
  function buildChannelCta(): string {
    return resolveCta(ctaProfile?.default_cta, {
      city: city || ctaProfile?.location_city,
      state: state || ctaProfile?.location_state,
      name: ctaProfile?.full_name,
      company: ctaProfile?.company_name,
      years: ctaProfile?.market_years,
    });
  }

  function addChannelCta() {
    const cta = buildChannelCta();
    setScript((s) => (s.trim() ? `${s.trimEnd()}\n\n${cta}` : cta));
    toast.success("Channel CTA added to the end of your script!");
  }

  // Auto-stop at the 15-minute cap so the video stays YouTube-publishable.
  // Branded Look appends a ~3s end card, so it stops early enough to fit.
  useEffect(() => {
    const reserveEndCard = brandedActive && !unbranded;
    const cap = reserveEndCard ? MAX_RECORD_SECONDS - Math.ceil(END_CARD_MS / 1000) - 1 : MAX_RECORD_SECONDS;
    if (isRecording && seconds >= cap) {
      stopRecording();
      toast("15-minute limit reached — wrapping up your recording.", { icon: "⏱️" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, isRecording, brandedActive, unbranded]);

  // Attach the preview stream once the camera step has actually mounted its
  // <video>. openCamera() runs while the script step is still on screen, so it
  // cannot do this itself.
  useEffect(() => {
    if (step !== "camera") return;
    const el = videoRef.current;
    const stream = previewStreamRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = true;
    el.play().catch(() => { /* preview only — recording is unaffected */ });
  }, [step]);

  async function openCamera() {
    setCamError(null);
    try {
      // Ask for 1080p at 60fps — browsers gracefully fall back to the best the camera supports
      //
      // The audio half is unchanged when the microphone tools are off. With
      // them on it also names the chosen microphone; if that one has gone, the
      // catch below reopens on the default rather than leaving you stuck.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: "user" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          ...(micTools && micId ? { deviceId: { exact: micId } } : {}),
        },
      });
      streamRef.current = stream;
      if (micTools) {
        setMicStream(stream);
        setMicHeard(false);
        void refreshMics();
        const gave = stream.getAudioTracks()[0];
        // The browser handed back a different microphone from the one asked
        // for: say so rather than let the take run on the wrong input.
        if (micId && gave?.getSettings().deviceId && gave.getSettings().deviceId !== micId) {
          setMicId(gave.getSettings().deviceId ?? null);
          setMicNotice(`That microphone isn't available, so we switched to ${gave.label || "the default microphone"}.`);
        }
      }
      // What the device is actually giving us, for the rotate warning above.
      const camSettings = stream.getVideoTracks()[0]?.getSettings();
      if (camSettings?.width && camSettings?.height) {
        setCamLandscape(camSettings.width >= camSettings.height);
      }

      // Branded Look: route the camera through the compositing canvas so the
      // preview shows exactly what gets recorded. Any failure falls back to
      // the plain path — the recording itself is never blocked.
      let previewStream: MediaStream = stream;
      setCompositeFailure(
        !brandedSupported ? "This browser can't reshape video while recording."
          : !brandedLook ? "Branded Look is switched off, so the camera records at its own shape."
          : null,
      );
      if (brandedLook && brandedSupported) {
        try {
          const music = musicUrlFor(musicId);
          const composite = new BrandedComposite(
            {
              name: ctaProfile?.full_name,
              brokerage: ctaProfile?.company_name,
              license: ctaProfile?.license_number,
              phone: ctaProfile?.phone,
              city: city || ctaProfile?.location_city,
              state: state || ctaProfile?.location_state,
              logoUrl: ctaProfile?.logo_url,
              headshotUrl: ctaProfile?.avatar_url,
            },
            music,
            // A clip behind you takes the background, so the photos would be
            // loaded and then never drawn — twelve images fetched for nothing.
            useBroll && !brollVideoUrl ? photos : [],
            unbranded,
            "medium",
            SHAPES[shape],
          );
          previewStream = await composite.init(stream, { brollVideo: brollVideoUrl });
          compositeRef.current = composite;
          setBrandedActive(true);
          if (composite.musicUnavailable) {
            toast("That music track wouldn't load — recording without a music bed.", { icon: "🎵" });
          }
        } catch (err) {
          console.warn("[camera] Branded Look unavailable, recording plain:", err);
          compositeRef.current = null;
          setBrandedActive(false);
          setCompositeFailure(
            err instanceof Error && /read back black/.test(err.message)
              ? "Your browser couldn't read the camera picture, so the shaped recorder didn't start."
              : "The shaped recorder didn't start on this device.",
          );
          // A black readback is a browser/GPU problem with a known fix, so say
          // so — "unavailable on this device" reads as permanent and isn't.
          const blackFrames = err instanceof Error && /read back black/.test(err.message);
          toast(
            blackFrames
              ? "Your browser couldn't read the camera picture, so this records without overlays. Turning off graphics acceleration in your browser settings usually fixes it."
              : "Branded Look unavailable on this device — recording without overlays.",
            { icon: "🎬", duration: blackFrames ? 9000 : 4000 },
          );
        }
      } else {
        setBrandedActive(false);
      }

      // The preview <video> lives in the camera step, which has not rendered
      // yet — videoRef is still null here, so assigning to it silently did
      // nothing and the camera screen came up black on every machine. Hand the
      // stream to the effect below, which attaches it once the element exists.
      previewStreamRef.current = previewStream;
      setStep("camera");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";

      /**
       * The chosen microphone has gone — a headset unplugged since last time.
       *
       * Only reachable with the tools on, because only then is a specific
       * device named. Forget the choice and reopen on the default: a missing
       * pair of earbuds must never be the reason you cannot record.
       */
      if (micTools && micId && (name === "NotFoundError" || name === "OverconstrainedError")) {
        setMicId(null);
        setPreferredId(null);
        setMicNotice("Your selected microphone disconnected. We switched to the default microphone.");
        await openCamera();
        return;
      }

      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      // Unchanged for the Camera tab. With the tools on, a microphone-specific
      // failure gets the shared wording, which says what to do about it.
      const micSpecific = micTools && (name === "NotReadableError" || name === "AbortError");
      setCamError(
        micSpecific
          ? micErrorMessage(err)
          : msg.includes("permission") || msg.includes("notallowed") || msg.includes("denied")
            ? "Camera or microphone access was denied. Please allow access in your browser settings and try again."
            : "Could not access your camera. Make sure it is not in use by another application.",
      );
    }
  }

  function closeCamera() {
    compositeRef.current?.destroy();
    compositeRef.current = null;
    previewStreamRef.current = null;
    setBrandedActive(false);
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // The meter reads the camera's own audio track, so it ends with it.
    setMicStream(null);
    // Approving a horizontal take applies to that take only. Carrying it into
    // the next one would be the same silent shape change, one step removed.
    setRawShapeApproved(false);
    setCompositeFailure(null);
  }

  function startScroll() {
    if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    scrollTimerRef.current = setInterval(() => {
      if (!teleRef.current) return;
      scrollPosRef.current += speedRef.current / 30;
      teleRef.current.scrollTop = scrollPosRef.current;

      // Feed the composite from the scroll position.
      //
      // The b-roll has always been able to follow the script — currentBrollShot
      // uses scriptProgress whenever it is set — but only voice-follow ever set
      // it. On auto-scroll it stayed null and the photos ran on a stopwatch,
      // which is why the pictures did not match the words. The prompter's own
      // position is a perfectly good measure of how far through the read we
      // are, and it is already being computed here every 33ms.
      const el = teleRef.current;
      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable > 0) {
        compositeRef.current?.setScriptProgress(scrollPosRef.current / scrollable);
      }
    }, 33);
  }

  function stopScroll() {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }

  /**
   * Three seconds before the light goes on.
   *
   * Recording began the instant the button was pressed, so every take opened
   * with a hand returning to the desk and a face still settling. The
   * teleprompter starts with the recording, not with the count.
   */
  function beginCountdown() {
    if (countdown !== null || isRecording) return;
    setCountdown(3);
    const tick = setInterval(() => {
      setCountdown((n) => {
        if (n === null) { clearInterval(tick); return null; }
        if (n <= 1) {
          clearInterval(tick);
          // Out of the state updater — starting a recorder mid-render is not
          // something React should be asked to reason about.
          setTimeout(() => { setCountdown(null); startRecording(); }, 0);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }

  /**
   * Average luminance of the preview, sampled while framing up.
   *
   * Deliberately only brightness. "Too close" or "off centre" would need face
   * detection, which is not dependable across browsers — and a framing warning
   * that fires on the wrong thing is worse than none. Backlighting is the
   * complaint the tips list already leads with, and it is measurable.
   */
  useEffect(() => {
    if (step !== "camera" || isRecording) return;
    const probe = document.createElement("canvas");
    probe.width = 32; probe.height = 18;
    const ctx = probe.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const id = setInterval(() => {
      const el = videoRef.current;
      if (!el || el.readyState < 2) return;
      try {
        ctx.drawImage(el, 0, 0, probe.width, probe.height);
        const { data } = ctx.getImageData(0, 0, probe.width, probe.height);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          // Rec. 601 luma — close enough for "is this person in the dark".
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        setBrightness(sum / (data.length / 4) / 255);
      } catch { /* a tainted or not-yet-ready frame — try again next tick */ }
    }, 1200);
    return () => clearInterval(id);
  }, [step, isRecording]);

  function startRecording() {
    // Branded Look records the composited canvas stream; plain mode records
    // the raw camera stream exactly as before.
    const sourceStream = compositeRef.current?.stream ?? streamRef.current;
    if (!sourceStream) return;
    // Second line of defence. The button is already disabled in this state;
    // this is here so no other path can start a take that would silently come
    // out in a different shape from the one on screen.
    if (shapeUnsafe) {
      toast.error("Vertical 9:16 can't be recorded right now — choose Try Again or Record Horizontal Instead.");
      return;
    }
    chunksRef.current = [];
    scrollPosRef.current = 0;
    if (teleRef.current) teleRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });

    const mimeType = pickRecordingMimeType();

    /**
     * Cap the bitrate. The browser default (often 5-8 Mbps at 1080p) produced
     * 500 MB+ files for long recordings, which storage rejected outright and
     * the upload silently failed.
     *
     * 1.6 Mbps, not the 2.5 it asked for before: a measured 1:50 recording came
     * back at 3,436 kb/s despite that 2.5 request — the hint is a hint, and the
     * encoder overshot it — which made a 49 MB file that a phone spent a long
     * time buffering before it would play. Asking for 1.6 lands nearer 2 in
     * practice, roughly halving it. Resolution is untouched at 1080p; talking
     * head footage is a mostly static frame and holds up at this rate.
     */
    const recorder = new MediaRecorder(sourceStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 1_600_000,
      audioBitsPerSecond: 128_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recordedType(recorder, mimeType);
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      // Minted here, at the one moment this recording becomes a thing that can
      // be lost. Every later attempt to save it carries this same id.
      recoveryIdsRef.current.set(blob, newRecoveryId());
      setVideoBlob(blob);
      setVideoUrl(url);
      // Kept rather than replaced. Each is saved to My Content on its own, but
      // choosing between two takes should not mean leaving this screen.
      setTakes((prev) => {
        const next = [...prev, { url, blob, seconds }];
        setViewingTake(next.length - 1);
        return next;
      });
      // Last moment either source can answer: closeCamera() destroys the
      // composite and ends the camera track on the next line.
      recordedSizeRef.current = compositeRef.current?.dimensions ?? (() => {
        const s = streamRef.current?.getVideoTracks()[0]?.getSettings();
        return s?.width && s?.height ? { width: s.width, height: s.height } : null;
      })();
      // Captured here because closeCamera() on the next line destroys the
      // composite and clears brandedActive — after which neither can be asked.
      setTakeShape(
        recordedSizeRef.current
          ? { ...recordedSizeRef.current, branded: !!compositeRef.current }
          : null,
      );
      closeCamera();
      setStep("done");
    };

    recorder.start(200);
    recorderRef.current = recorder;
    setIsRecording(true);
    setIsPaused(false);
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    compositeRef.current?.startMusic();
    compositeRef.current?.startBroll();
    startPrompter();
  }

  // Starts the scroll engine for the current mode: Flow (voice-follow) with
  // automatic fallback to constant-speed auto-scroll if recognition dies.
  // When Branded Look live captions are on, the same recognizer also feeds
  // the burned-in caption overlay (only one recognizer ever runs).
  function startPrompter() {
    const wantCaptions = brandedActive && liveCaptions && flowSupported;
    const feedCaption = wantCaptions
      ? (text: string) => compositeRef.current?.setCaption(text)
      : undefined;

    // Voice-follow needs words to follow. On the freestyle route there are
    // none, so it falls to auto — which scrolls an empty prompter, i.e. does
    // nothing — and live captions still run off their own recognizer below.
    if (!freestyle && scrollMode === "flow" && flowSupported) {
      followerRef.current?.stop();
      // Photos advance with the speaker's position in the script rather than a
      // stopwatch, so the picture matches what is being said.
      const totalWords = script.trim().split(/\s+/).filter(Boolean).length;
      const follower = new VoiceFollower(
        script,
        (i) => {
          followWordInContainer(teleRef.current, i);
          if (totalWords > 0) compositeRef.current?.setScriptProgress(i / totalWords);
        },
        () => {
          followerRef.current = null;
          toast("Voice-follow unavailable — switching to auto-scroll.", { icon: "🎚️" });
          setScrollMode("auto");
          startScroll();
        },
        feedCaption,
      );
      followerRef.current = follower;
      follower.start();
    } else {
      startScroll();
      if (wantCaptions) {
        transcriberRef.current?.stop();
        const transcriber = new LiveTranscriber(
          (text) => compositeRef.current?.setCaption(text),
          () => { transcriberRef.current = null; },
        );
        transcriberRef.current = transcriber;
        transcriber.start();
      }
    }
  }

  function stopPrompter() {
    stopScroll();
    followerRef.current?.stop();
    followerRef.current = null;
    transcriberRef.current?.stop();
    transcriberRef.current = null;
  }

  function pauseRecording() {
    recorderRef.current?.pause();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopScroll();
    followerRef.current?.pause();
    transcriberRef.current?.pause();
    compositeRef.current?.pauseMusic();
    compositeRef.current?.pauseBroll();
    setIsPaused(true);
  }

  function resumeRecording() {
    recorderRef.current?.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    if (followerRef.current) followerRef.current.resume();
    else if (scrollMode === "auto") startScroll();
    transcriberRef.current?.resume();
    compositeRef.current?.startMusic();
    compositeRef.current?.startBroll();
    setIsPaused(false);
  }

  function stopRecording() {
    if (stoppingRef.current) return;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopPrompter();
    setIsRecording(false);
    setIsPaused(false);

    // Branded Look: show the branded end card for ~3s before finalizing —
    // music keeps playing underneath, then recorder.onstop tears everything down.
    // An unbranded cut has no card to hold on, so it finalises immediately
    // rather than recording three seconds of a frozen last frame.
    if (brandedActive && compositeRef.current?.showsEndCard) {
      stoppingRef.current = true;
      compositeRef.current.beginEndCard();
      setTimeout(() => {
        stoppingRef.current = false;
        recorderRef.current?.stop();
      }, END_CARD_MS + 150);
    } else {
      recorderRef.current?.stop();
    }
  }

  function handleReset() {
    closeCamera();
    stopPrompter();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Not revoked: the takes list still points at it, and a retake is the
    // one moment you most want the previous take still playable.
    setVideoUrl(null);
    setVideoBlob(null);
    setIsRecording(false);
    setIsPaused(false);
    setSeconds(0);
    scrollPosRef.current = 0;
    setCamError(null);
    setStep("script");
  }

  function handleDownload() {
    if (!videoUrl || !videoBlob) return;
    const ext = videoBlob.type.includes("mp4") ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `my-video-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Download started!");
  }

  async function handleSpark() {
    if (!sparkTopic.trim()) return;
    setSparking(true);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: sparkTopic.trim(), length: sparkLength, unbranded }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      // Append the user's default CTA so the teleprompter always closes with
      // it — they'd otherwise have to remember the Add Channel CTA button.
      //
      // Except on an unbranded cut, where the CTA is the whole problem: it
      // names the agent and asks the viewer to call them. Suppressing the
      // overlays and then stapling that onto the script would produce a video
      // that looks compliant and isn't.
      const cta = unbranded ? "" : buildChannelCta();
      const generated = (data.script as string) || "";
      setScript(cta.trim() ? `${generated.trimEnd()}\n\n${cta}` : generated);
      setShowSpark(false);
      setSparkTopic("");
      toast.success(unbranded
        ? "Script ready — written unbranded, with no contact ask."
        : "Script ready — your channel CTA is at the end!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate script");
    } finally {
      setSparking(false);
    }
  }

  // Photos can arrive after the camera is already running — pasting a listing
  // URL on this tab appends to the same array — and the composite loaded its
  // set once at init. Keep them in step for as long as it exists.
  useEffect(() => {
    if (!compositeRef.current) return;
    void compositeRef.current.setPhotos(useBroll && !brollVideoUrl ? photos : []);
  }, [photos, useBroll, brollVideoUrl]);

  // Still worth warning, but the window is now only the seconds between a take
  // finishing and its upload completing — not for as long as someone fails to
  // notice a button.
  useEffect(() => {
    if (!videoBlob || savedVideoId) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [videoBlob, savedVideoId]);

  /**
   * Put the take in My Content.
   *
   * `openShare` is what the button passes. The automatic save below does not —
   * a share sheet appearing unasked, over a take nobody has watched yet, is
   * startling.
   */
  /** Everything the device needs to finish this upload later, without the page. */
  function buildRecord(blob: Blob): RecoveryRecord {
    let id = recoveryIdsRef.current.get(blob);
    if (!id) {
      id = newRecoveryId();
      recoveryIdsRef.current.set(blob, id);
    }
    const size = recordedSizeRef.current;
    const mimeType = blob.type || "video/webm";
    // promptScript, not script: on the freestyle route nothing was read, so
    // storing a script that had been sparked and then abandoned would file
    // the video under words it does not contain. The transcript from the
    // step after this is what titles it there.
    const title = promptScript.split(/\n/)[0].slice(0, 100).trim()
      || (city ? `${city} recording` : "Camera Recording");
    return {
      id,
      // Empty only if auth has not resolved yet, which a recording taking
      // seconds makes unlikely. The store then keeps it in memory rather than
      // filing it unowned, where the next person to sign in could see it.
      userId: user?.id ?? "",
      kind: "camera",
      projectId: null,
      blob,
      title,
      script: promptScript,
      videoType: videoTypeForSize(size),
      width: size?.width ?? null,
      height: size?.height ?? null,
      mimeType,
      extension: videoExtensionForType(mimeType),
      createdAt: Date.now(),
      status: "pending",
      attempts: 0,
      lastError: null,
    };
  }

  /**
   * The record to save this blob under — the existing one if it has already
   * been tried.
   *
   * Building a fresh record on every save reset the attempt count to zero and
   * the recorded time to now, so pressing Save to My Content after a failure —
   * the path most likely to be a second attempt — reported it as a first one.
   * A retry is another go at the same recording, not a new recording.
   */
  function recordFor(blob: Blob): RecoveryRecord {
    const id = recoveryIdsRef.current.get(blob);
    const existing = id ? recoveries.find((r) => r.id === id) : undefined;
    return existing ? { ...existing, blob } : buildRecord(blob);
  }

  /**
   * The only path from a finished recording to a saved one.
   *
   * The automatic save, the button and a retry all come through here, so the
   * guarantee holds however the save was asked for — there is no second route
   * that skips the keeping step.
   *
   * The order is the whole point:
   *   1. the blob is already in memory;
   *   2. try to keep it on the device;
   *   3. upload whether or not that worked — a browser that refuses to store
   *      a copy is no reason not to try the thing that makes the copy moot;
   *   4. count it saved only once the server returns a video id;
   *   5. delete the device copy only then.
   */
  function preserveThenUpload(
    record: RecoveryRecord,
    openShare: boolean,
  ): Promise<{ videoId: string; alreadySaved: boolean } | null> {
    /**
     * One attempt at a time per recording.
     *
     * The automatic save and the button can both be reaching for the same take,
     * and two attempts for one recovery id means two calls to camera-upload-url
     * — where the second one's clearing of the deterministic path can land
     * while the first one is still uploading to it. They are the same request;
     * the second caller joins the first rather than starting a rival.
     */
    const running = inFlightRef.current.get(record.id);
    if (running) return running;
    const attempt = (async () => {
      try {
        return await runPreserveThenUpload(record, openShare);
      } finally {
        inFlightRef.current.delete(record.id);
      }
    })();
    inFlightRef.current.set(record.id, attempt);
    return attempt;
  }

  async function runPreserveThenUpload(record: RecoveryRecord, openShare: boolean) {
    setSaving(true);
    setRetryingId(record.id);
    const kept = await putRecovery({ ...record, status: "uploading" });
    setStoreUnavailable(!kept);
    setRecoveries((prev) => [
      { ...record, status: "uploading" },
      ...prev.filter((r) => r.id !== record.id),
    ]);
    try {
      const { videoId, title: savedName, projectId, alreadySaved } = await uploadCameraRecording(record.blob, {
        title: record.title,
        script: record.script,
        videoType: record.videoType,
        // Same id on every attempt, so a retry of a save that already worked
        // returns that video rather than making another one.
        idempotencyKey: record.id,
      });
      // Confirmed — either saved just now, or already saved and this browser
      // simply never heard. Both mean the server has it and the file behind it
      // is intact, which is the only thing that makes the device copy
      // redundant.
      await deleteRecovery(record.id);
      setRecoveries((prev) => prev.filter((r) => r.id !== record.id));
      setStoreUnavailable(false);
      setSavedVideoId(videoId);
      setSavedTitle(savedName);
      setSavedProjectId(projectId);
      // Recorded against this take specifically, so the screen can tell which
      // of several takes it is describing.
      setSavedByRecovery((prev) => ({
        ...prev,
        [record.id]: { videoId, projectId, title: savedName },
      }));
      if (openShare) setShowPublish(true);
      return { videoId, alreadySaved: !!alreadySaved };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      const stage = (err as { stage?: string } | null)?.stage ?? null;
      const attempts = record.attempts + 1;
      await updateRecovery(record.id, { status: "failed", attempts, lastError: message, lastStage: stage });
      setRecoveries((prev) => [
        { ...record, status: "failed", attempts, lastError: message, lastStage: stage },
        ...prev.filter((r) => r.id !== record.id),
      ]);
      const payload = err instanceof Error
        ? { error: err.message, code: (err as Error & { code?: string }).code }
        : null;
      if (!showTrialLock(payload)) toast.error(message);
      return null;
    } finally {
      setSaving(false);
      setRetryingId(null);
    }
  }

  /** Finish an upload that was interrupted, from the copy on this device. */
  async function retryRecovery(rec: RecoveryRecord) {
    if (retryingId) return;
    const done = await preserveThenUpload(rec, false);
    if (done) {
      toast.success(done.alreadySaved
        ? "Already saved — it reached the server the first time. It's in My Content."
        : "Uploaded — it's in My Content.");
    }
  }

  /**
   * Forget a held recording.
   *
   * Confirmed every time: this is the only copy, and deleting it silently
   * would be exactly the loss the whole feature exists to prevent. Nothing
   * removes one on its own — not age, not a later take.
   */
  async function removeRecovery(rec: RecoveryRecord) {
    if (!confirm("Remove this recording from your device? It was never uploaded, so this cannot be undone.")) return;
    await deleteRecovery(rec.id);
    setRecoveries((prev) => prev.filter((r) => r.id !== rec.id));
  }

  async function handleSaveForSocial() {
    // The take on screen, which is the one this button appears to be about.
    const blob = viewedBlob;
    if (!blob) return;
    // Already saved by the effect below — this is only the share sheet now.
    if (viewedSaved) { setShowPublish(true); return; }
    // Same path as the automatic save, so pressing the button after a failure
    // retries from the kept copy rather than starting a different kind of save.
    await preserveThenUpload(recordFor(blob), true);
  }

  /**
   * Recordings still waiting from an earlier visit.
   *
   * The beforeunload warning below can be dismissed, and on a phone it is not
   * shown at all — a call arriving mid-upload simply takes the tab. Loaded per
   * user, so signing in as someone else shows none of them.
   */
  useEffect(() => {
    if (!user?.id) { setRecoveries([]); return; }
    let live = true;
    listRecoveries(user.id, "camera").then((rs) => { if (live) setRecoveries(rs); });
    return () => { live = false; };
  }, [user?.id]);

  /**
   * Save the take as soon as it exists, rather than waiting to be asked.
   *
   * Vercel had no call to camera-upload-url or save-camera-recording in the
   * whole window on two separate days: a recording was made, the page moved
   * on, and nothing had ever been sent. The beforeunload warning added after
   * the first time only covers closing the tab — stepping somewhere else
   * inside the app is a React route change and fires nothing.
   *
   * The editor's teleprompter has always uploaded the moment it stops. To the
   * person holding the camera these are the same feature, and only one of them
   * kept the footage. A retake now costs a spare row in My Content, which is a
   * delete; the alternative cost the whole recording.
   */
  const savedBlobsRef = useRef(new WeakSet<Blob>());
  useEffect(() => {
    // Keyed on the blob, not on savedVideoId. That id belongs to whichever
    // take saved last, so guarding on it meant take two was never uploaded —
    // the retake feature quietly losing exactly what it exists to keep.
    if (!videoBlob || saving || savedBlobsRef.current.has(videoBlob)) return;
    savedBlobsRef.current.add(videoBlob);
    (async () => {
      const done = await preserveThenUpload(recordFor(videoBlob), false);
      if (done) {
        toast.success(done.alreadySaved
          ? "This recording was already saved — it's in My Content."
          : "Saved to My Content.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoBlob]);

  /**
   * The take the done screen is actually showing — not necessarily the newest.
   *
   * Everything the screen says about saving is answered for THIS take, because
   * the takes strip lets you look at an earlier one and the answers differ.
   */
  const viewedBlob = takes[viewingTake]?.blob ?? videoBlob;
  const viewedRecoveryId = viewedBlob ? recoveryIdsRef.current.get(viewedBlob) : undefined;
  /** Where this take ended up, if it reached the server. */
  const viewedSaved = viewedRecoveryId ? savedByRecovery[viewedRecoveryId] : undefined;
  /** Its copy held on this device, if it has not. */
  const viewedRecovery = viewedRecoveryId
    ? recoveries.find((r) => r.id === viewedRecoveryId)
    : undefined;
  const allTakesSaved = takes.every((t) => {
    const id = recoveryIdsRef.current.get(t.blob);
    return !!(id && savedByRecovery[id]);
  });

  const takesRef = useRef(takes);
  takesRef.current = takes;
  useEffect(() => () => {
    takesRef.current.forEach((t) => URL.revokeObjectURL(t.url));
  }, []);

  useEffect(() => {
    return () => {
      closeCamera();
      stopScroll();
      followerRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * One length picker, rendered in either of two places.
   *
   * It used to live only inside the Spark panel, so folding that panel away on
   * the routes where the page writes the script would have taken the length
   * with it — and the page's writer reads the very same value.
   */
  const scriptLengthPicker = (
    <div className="mt-2">
      <p className="text-[11px] font-semibold text-slate-500 mb-1">Script Length</p>
      <div className="grid grid-cols-5 gap-1.5">
        {CAMERA_LENGTHS.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setSparkLength(l.key)}
            aria-pressed={sparkLength === l.key}
            className={`px-1 py-1.5 rounded-lg border text-center transition-colors ${
              sparkLength === l.key
                ? "border-primary-500 bg-white"
                : "border-primary-200 bg-white/60 hover:border-primary-300"
            }`}
          >
            <span className="block text-[12px] font-bold leading-[1.1] text-brand-text">
              {l.minutes} min
            </span>
            <span className="block text-[9.5px] leading-[1.2] text-slate-500">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ── Script step ─────────────────────────────────────────────────────────────
  if (step === "script") {
    return (
      <div className="flex flex-col gap-5">
        {/* Recordings that never reached the server, offered before anything
            else on this screen — recording over the top of one is the single
            action that would lose it for good. Listed rather than merged: a
            second failed take must not stand in for the first. */}
        {recoveries.map((rec) => {
          const memoryOnly = isMemoryOnly(rec.id);
          return (
            <div
              key={rec.id}
              className="flex flex-col gap-3 rounded-xl border border-spark-amber/40 bg-spark-amber/5 p-4"
            >
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-spark-amber" />
                <div className="text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">
                    {memoryOnly
                      ? "This recording is only in this open page."
                      : "Your recording is safely waiting on this device."}
                  </p>
                  <p className="mt-0.5">
                    {memoryOnly
                      ? "Your browser wouldn't store a recovery copy, so download it now — closing or reloading this page will lose it."
                      : rec.lastStage === "after-save"
                        ? "It may already have reached the server — the reply never arrived, so this browser can't tell. Retrying will check rather than save it twice."
                        : "The upload didn't finish. You can send it again without recording it again."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {rec.title} · {describeSize(rec.blob.size)} · recorded {describeAge(rec.createdAt)}
                    {rec.width && rec.height ? ` · ${rec.width} × ${rec.height}` : ""}
                    {rec.attempts > 0 ? ` · ${rec.attempts} failed ${rec.attempts === 1 ? "attempt" : "attempts"}` : ""}
                  </p>
                  {/* Which stage it stopped at, because the answer changes what
                      a retry has to do — and after a lost reply the recording
                      may already be saved. */}
                  {/* The stage sentence already contains the reason for a
                      simulated failure, so printing both said it twice. */}
                  {rec.lastError && (
                    <p className="mt-1 text-xs text-red-700">
                      {rec.lastStage && STAGE_LABELS[rec.lastStage as UploadStage]
                        ? `Stopped ${STAGE_LABELS[rec.lastStage as UploadStage]}.`
                        : rec.lastError}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => retryRecovery(rec)}
                  loading={retryingId === rec.id}
                  disabled={!!retryingId}
                  size="sm"
                  className="gap-2"
                >
                  {/* Button draws its own spinner from `loading` — a second
                      one here would sit right beside it. */}
                  {retryingId === rec.id ? "Uploading…" : "Retry Upload"}
                </Button>
                <Button
                  onClick={() => downloadRecovery(rec)}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!!retryingId}
                >
                  <Download size={14} /> Download
                </Button>
                <button
                  onClick={() => removeRecovery(rec)}
                  disabled={!!retryingId}
                  className="px-3 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-40"
                >
                  Remove From Device
                </button>
              </div>
            </div>
          );
        })}

        {/* Says what is missing and that it is missing on purpose. A screen
            that simply had no script box on it would read as one still
            loading, or as the choice not having taken. */}
        {freestyle && (
          <div className="rounded-xl border border-spark-rule bg-white/60 px-4 py-3">
            <p className="text-sm font-semibold text-brand-text">No script — just talk</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-spark-ink-muted">
              The teleprompter stays off. Everything below still applies: your branding, your
              shape, your photos behind you. We&apos;ll transcribe what you said afterwards and
              write the title, description and hashtags from it.
            </p>
          </div>
        )}

        {!freestyle && (<>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-brand-text">
              {/* Named for what it is on this route. "Your Script" under a
                  brief box that is also asking for the script reads as a
                  second one to fill in. */}
              {scriptSourceAbove ? "Your teleprompter" : "Your Script"}
            </label>
            {!scriptSourceAbove && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSpark((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                >
                  <Sparkles size={12} />
                  {showSpark ? "Hide" : "Spark with AI"}
                </button>
              </div>
            )}
          </div>

          {scriptSourceAbove && (
            <p className="mb-2 text-[11.5px] leading-[1.45] text-spark-ink-muted">
              The script written above lands here. Edit it if you want — this is
              what scrolls while you record.
            </p>
          )}

          {/* No length picker here any more when the page writes the script.
              It now sits above the button that writes, which is where the
              value is actually read — down here it was four sections BELOW
              that button, so the script came out at the default and moving
              this changed nothing until you regenerated. The Spark panel
              below keeps its own copy, because there the button and the
              picker are in the same box. */}

          {showSpark && !scriptSourceAbove && (
            <div className="mb-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
              <TopicRadar city={city} state={state} onSelect={(t) => setSparkTopic(t)} />

              {/* Script length — recordings are free, so pick whatever fits.
                  Five options across four columns left "Longform 15 min"
                  stranded on a row of its own, where a button sitting alone
                  under a grid reads as a different kind of control rather than
                  the fifth of five. Five columns, and the minutes lead.
                  Three of the five were labelled "Shorts" and two "Longform",
                  so the label was the half that could not tell them apart —
                  the number is what anyone is actually choosing between. */}
              {scriptLengthPicker}

              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={sparkTopic}
                  onChange={(e) => setSparkTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !sparking && handleSpark()}
                  placeholder="What do you want to speak about?"
                  className="flex-1 text-sm px-3 py-2 border border-primary-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                />
                <Button
                  size="sm"
                  onClick={handleSpark}
                  disabled={!sparkTopic.trim() || sparking}
                  className="gap-1.5 shrink-0"
                >
                  {sparking ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
                  {sparking ? "Sparking..." : "Spark It"}
                </Button>
              </div>
            </div>
          )}

          <div className="relative">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={
                scriptSourceAbove
                  ? "Your script appears here once it's written above — or type it yourself."
                  : "Type your script, or tap the mic to speak it…"
              }
              className="w-full h-36 text-sm px-3 py-3 pr-14 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
            />
            <div className="absolute bottom-2 right-2">
              <FieldMic
                size="md"
                onTranscript={(t) => setScript((s) => s ? `${s} ${t}` : t)}
                title="Hit the Mic — Speak Your Script"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1 mb-2">
            {script.trim().split(/\s+/).filter(Boolean).length} words
          </p>
        </div>

        {/* Only once there is something for it to scroll. Choosing whether
            the prompter follows your voice or runs at a constant speed, over
            an empty box reading "0 words", is a setting for a thing that does
            not exist yet — and it is the question you can answer best after
            reading what was written. */}
        {script.trim() && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Teleprompter Mode
          </p>
          {flowSupported && (
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setScrollMode("flow")}
                className={cn(
                  "flex-1 py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all",
                  scrollMode === "flow"
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                🎙 Flow — Follows Your Voice
              </button>
              <button
                onClick={() => setScrollMode("auto")}
                className={cn(
                  "flex-1 py-2 px-2 rounded-xl text-xs font-medium border-2 transition-all",
                  scrollMode === "auto"
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : "border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                Auto — Constant Speed
              </button>
            </div>
          )}
          {scrollMode === "flow" && flowSupported ? (
            <p className="text-xs text-slate-400">
              The Teleprompter Listens And Scrolls At Your Pace — Pause To Think And It Waits For You
            </p>
          ) : (
            <div className="flex gap-2">
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => setSpeedIdx(i)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all",
                    speedIdx === i
                      ? "border-primary-500 bg-primary-50 text-primary-600"
                      : "border-slate-200 text-slate-500 hover:border-slate-300",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        )}
        </>)}

        {/* ── Shape ──
            Chosen before recording rather than read off the finished file.
            Cropping a portrait take into landscape afterwards loses your head
            and your feet — the information was never captured — so the only
            way to get a good landscape video is to frame one. */}
        {(brandedSupported || micTools) && (
          <div className="rounded-xl border border-spark-rule p-3.5">
            {/* Same eyebrow-and-question device as the Create screen, so the
                two halves of one flow read as one flow. "Shape" named the
                setting; this names the decision. */}
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-spark-amber">
              Production
            </p>
            <p className="mb-2 mt-[3px] text-[15px] font-semibold leading-[1.2] text-spark-ink">
              Choose your format
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SHAPE_META.map((sh) => {
                const active = shape === sh.key;
                return (
                  <button
                    key={sh.key}
                    type="button"
                    onClick={() => {
                      setShape(sh.key);
                      // Compositing is what makes the shape possible: without
                      // the canvas the raw camera stream is recorded and there
                      // is nothing to fit into a frame.
                      if (!brandedLook) {
                        setBrandedLook(true);
                        toast("Branded Look switched on — it's what lets the video be reshaped.", { icon: "✨" });
                      }
                    }}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-[1.5px] border-spark-amber bg-spark-amber-tint"
                        : "border-spark-rule bg-white hover:border-spark-rule-dim",
                    )}
                  >
                    <span className="block text-[13px] font-semibold text-spark-ink">
                      {sh.label} · {sh.ratio}
                    </span>
                    <span className="block text-[11px] text-spark-ink-muted">{sh.where}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.45] text-spark-ink-muted">
              {SHAPE_META.find((sh) => sh.key === shape)?.tip}
            </p>

            {/* What will actually be recorded, in pixels, and by which path.
                The preview alone cannot tell you this: a raw horizontal camera
                shown in a vertical frame looks like a vertical recording. */}
            {micTools && (
              <div className="mt-3 rounded-lg bg-spark-paper/70 px-3 py-2">
                <p className="text-[11.5px] font-medium text-spark-ink">
                  Output: {shape === "vertical" ? "Vertical 9:16 · 1080 × 1920" : "Horizontal 16:9 · 1920 × 1080"}
                </p>
                <p className="mt-0.5 text-[11px] text-spark-ink-muted">
                  {!brandedSupported
                    ? "Raw camera — this browser can't reshape video, so takes come out in the camera's own shape."
                    : !brandedLook
                      ? "Raw camera — Branded Look is off, so takes come out in the camera's own shape."
                      : "Branded composite — the camera is fitted into the shape above, with your overlays."}
                </p>
              </div>
            )}
            {/* Only once the camera has told us what it is giving us, and only
                when it disagrees with the choice — a warning that fires before
                the camera opens is a warning nobody can act on. */}
            {camLandscape !== null && camLandscape !== (shape === "horizontal") && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-[1.45] text-amber-900">
                Your camera is {camLandscape ? "sideways" : "upright"} but you picked{" "}
                {shape === "horizontal" ? "horizontal" : "vertical"}. Turn the phone{" "}
                {shape === "horizontal" ? "sideways" : "upright"} before you record, or the sides
                of the picture get cropped away.
              </p>
            )}
          </div>
        )}

        {/* Branded Look — record-time overlays baked into the file. The panel
            renders even where compositing is unsupported, because the channel
            CTA lives at the bottom of it and must never disappear. */}
        <div className="p-3.5 bg-spark-blue/10/60 border border-spark-blue/20 rounded-xl animate-slideDown">
            <label className="flex items-center justify-between cursor-pointer select-none">
              <span className="text-sm font-semibold text-brand-text">✨ Branded Look</span>
              {brandedSupported ? (
                <div
                  onClick={(e) => { e.preventDefault(); setBrandedLook((v) => !v); }}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors",
                    brandedLook ? "bg-spark-blue" : "bg-slate-300",
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all",
                    brandedLook ? "left-[18px]" : "left-0.5",
                  )} />
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">Not available in this browser</span>
              )}
            </label>
            <p className="text-xs text-slate-500 mt-1">
              {!brandedSupported
                ? "This browser can't burn overlays into a recording, so your video records plain."
                : unbranded
                  ? "Unbranded: captions, b-roll and music still get burned in, but nothing that names you."
                  : "Burns your logo, name bar, and a 3-second branded end card into the recording — no editing needed."}
            </p>
            {brandedSupported && brandedLook && (
              <div className="mt-3 flex flex-col gap-2.5">
                {/* MLS listing media generally may not identify the agent.
                    Sits at the top of the panel because it changes what every
                    option below it produces — and it also reaches the script,
                    which is the half that is easy to miss. */}
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={unbranded}
                    onChange={(e) => setUnbranded(e.target.checked)}
                    className="accent-indigo-500 w-4 h-4 mt-0.5 shrink-0"
                  />
                  <span className="text-xs text-slate-600">
                    <strong>Unbranded cut for the MLS</strong> — no logo, name bar, licence or end
                    card, and Spark It writes the script with no contact ask.{" "}
                    <span className="text-slate-400">
                      Check what your board requires; the rules vary.
                    </span>
                  </span>
                </label>
                {/* Your own footage behind you. Sits above the photos because
                    it replaces them: the composite draws one background, and
                    cutting between a clip and a slideshow would be two
                    different ideas of what is behind you, alternating. */}
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <span className="flex-1 text-xs text-slate-600">
                      <strong>Play my footage behind me</strong> — your clip fills the screen while
                      you present in the corner.{" "}
                      <span className="text-slate-400">
                        Silent, and it loops if it is shorter than your take.
                      </span>
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300">
                      <Film size={13} />
                      {brollVideoUrl ? "Choose a different clip" : "Choose a clip"}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        className="sr-only"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (brollVideoUrl) URL.revokeObjectURL(brollVideoUrl);
                          setBrollVideoUrl(URL.createObjectURL(f));
                          setBrollVideoName(f.name);
                        }}
                      />
                    </label>
                    {brollVideoUrl && (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                          {brollVideoName}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(brollVideoUrl);
                            setBrollVideoUrl(null);
                            setBrollVideoName("");
                          }}
                          className="shrink-0 text-[11px] font-medium text-slate-400 underline hover:text-slate-600"
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                  {brollVideoUrl && (
                    <p className="text-[11px] leading-[1.45] text-slate-400">
                      Chosen before the camera opens — the background is built into the recording,
                      so it cannot be swapped once you are rolling.
                    </p>
                  )}
                </div>

                {photos.length > 0 && (
                  <label className={`flex items-start gap-2 select-none ${brollVideoUrl ? "opacity-45" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={useBroll && !brollVideoUrl}
                      disabled={!!brollVideoUrl}
                      onChange={(e) => setUseBroll(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-slate-600">
                      <strong>Use my {photos.length} photos as b-roll</strong> — they fill the screen
                      while you stay on camera in the corner.{" "}
                      <span className="text-slate-400">
                        You&apos;re full-screen for the first 8 seconds, then each photo holds about 10.
                      </span>
                    </span>
                  </label>
                )}
                {flowSupported && (
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={liveCaptions}
                      onChange={(e) => setLiveCaptions(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4 mt-0.5 shrink-0"
                    />
                    <span className="text-xs text-slate-600">
                      <strong>Live captions</strong> — burned in as you speak.{" "}
                      <span className="text-slate-400">~95% accuracy; a misheard word is permanent.</span>
                    </span>
                  </label>
                )}
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Music Bed <span className="font-normal text-slate-400">(mixed softly under your voice — permanent)</span></p>
                  <div className="flex gap-2">
                    {MUSIC_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMusicId(m.id)}
                        className={cn(
                          "flex-1 py-1.5 px-1 rounded-lg text-xs font-medium border transition-all",
                          musicId === m.id
                            ? "border-spark-blue bg-spark-blue/10 text-spark-blue"
                            : "border-slate-200 text-slate-500 hover:border-slate-300",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  What you see in the camera preview is exactly what gets recorded — overlays can&apos;t be removed afterwards.
                </p>
              </div>
            )}

            {/* Sits outside the toggle on purpose — this writes to the script,
                so turning Branded Look off must not take it away. */}
            {/* Appends a sentence to the script. It was a full-width filled
                button in a fourth colour, as loud as Open Camera — so a small
                text edit looked like a way to move forward. Outline, sized to
                its own words. */}
            {/* Hidden, not disabled, on the freestyle route — unlike the
                unbranded case there is no script for it to write to, so there
                is no control that moved and nothing to explain. */}
            {!freestyle && (
            <div className="mt-3 pt-3 border-t border-spark-blue/20">
              {/* Disabled rather than hidden on an unbranded cut: the button
                  appends your name and an invitation to call you, which is the
                  exact thing the cut may not contain. Hiding it would leave the
                  agent hunting for a control that had silently moved. */}
              <button
                onClick={addChannelCta}
                disabled={unbranded}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-500 text-emerald-700 hover:bg-emerald-500 hover:text-white text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
                title={unbranded
                  ? "Unavailable on an unbranded cut — the CTA names you and asks for contact"
                  : "Append your subscribe & contact CTA to the script"}
              >
                <Megaphone size={15} />
                Add Channel CTA
              </button>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {unbranded
                  ? "Off for an unbranded cut — the CTA names you and asks the viewer to get in touch."
                  : "Adds your subscribe & contact ask to the end of the script, so the teleprompter reads it for you."}
              </p>
            </div>
            )}
          </div>

        {/* Tips for best video */}
        <div className="p-3.5 bg-emerald-50/60 border border-emerald-100 rounded-xl">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Lightbulb size={13} className="text-emerald-500" /> Tips For Best Video
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc pl-4">
            <li>Film in <strong>1080p (Full HD) or higher at 60 fps</strong> — set this in your phone&apos;s camera settings before recording</li>
            <li>The <strong>back camera</strong> is much sharper than the selfie camera — use it when you don&apos;t need the teleprompter (or have someone film you)</li>
            <li>Face a window or light source — never sit with a bright light behind you</li>
            <li>Keep the camera at eye level and record in a quiet room</li>
            <li><strong>8–15 minutes</strong> is YouTube&apos;s algorithm sweet spot — and 8+ minutes unlocks mid-roll ads</li>
            {freestyle
              ? <li>Say your name and your town in the first ten seconds, and end by asking for the subscribe — nothing is on screen to remind you</li>
              : <li>End with a subscribe CTA — tap <strong>Add Channel CTA</strong> above to drop yours into the script so the teleprompter reads it for you</li>}
          </ul>
        </div>

        {/* The shared microphone tools. Rendered only when micTools is on, so
            the Camera tab is exactly as it was. */}
        {micTools && (
          <div className="rounded-xl border border-spark-rule bg-white p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Microphone</p>
              <a href="/campaigns/microphone" className="text-[11px] font-medium text-spark-amber hover:underline">
                Test it first
              </a>
            </div>

            {mics.length > 0 ? (
              <select
                value={micId ?? ""}
                onChange={(e) => { const id = e.target.value || null; setMicId(id); setPreferredId(id); }}
                disabled={isRecording}
                aria-label="Microphone"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
              >
                <option value="">Default microphone</option>
                {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
              </select>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                Your microphones are listed once you open the camera — browsers hide their names until then.
              </p>
            )}

            <div className="mt-3">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-[width] duration-75 ${micClipping ? "bg-red-500" : "bg-primary-500"}`}
                  style={{ width: `${micStream ? micLevel : 0}%` }}
                />
              </div>
              {/* The pre-flight check, in the order it matters: can we hear you,
                  and is it too loud. It can only answer once the camera — and
                  with it the microphone — is open. */}
              <p className={`mt-2 text-xs ${micClipping ? "text-amber-700" : micHeard ? "text-emerald-700" : "text-slate-400"}`}>
                {!micStream ? "Open the camera, then say a few words to check your microphone."
                  : micClipping ? "That's very loud and will distort. Move back, or turn the input down."
                  : micHeard ? "Sound detected — your microphone is working."
                  : "We cannot hear you yet. Check the right microphone is selected and not muted."}
              </p>
            </div>

            {micNotice && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-secondary-600">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                {micNotice}
              </p>
            )}
          </div>
        )}

        {camError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{camError}</p>
          </div>
        )}

        <Button
          onClick={openCamera}
          size="lg"
          className="w-full gap-2"
          disabled={!freestyle && !script.trim()}
        >
          <Camera size={18} /> Open Camera
        </Button>
        {!freestyle && !script.trim() ? (
          // A status, not a second instruction. The fixed bar at the bottom of
          // the screen is already telling you what to do for your route; this
          // line sitting under a greyed-out button was telling you something
          // else at the same time, in Title Case, a few pixels away.
          <p className="text-xs text-slate-400 text-center -mt-3">
            Waiting on your script
          </p>
        ) : (
          <p className="text-xs text-slate-400 text-center -mt-3">
            8–15 Min Is YouTube&apos;s Sweet Spot — 8+ Min Unlocks Mid-Roll Ads · 15 Min Max
          </p>
        )}
      </div>
    );
  }

  // ── Camera step (preview + recording) ─────────────────────────────────────
  if (step === "camera") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        {/* Teleprompter pinned to the very top (right under the device lens) so
            you read while looking at the camera. Shown once recording starts —
            and never on the freestyle route, where an empty black band would
            take a third of the screen away from the preview for nothing. */}
        {isRecording && promptScript.trim() && (
          <div
            ref={teleRef}
            className="shrink-0 h-40 sm:h-44 bg-black/85 backdrop-blur-sm px-5 py-4 overflow-hidden select-none border-b border-white/10"
          >
            {/* Narrow centered column keeps the reader's eyes near the lens
                instead of sweeping across the full screen width */}
            <p className="max-w-md mx-auto text-white text-xl sm:text-2xl leading-9 font-semibold whitespace-pre-wrap text-center">
              {/* Words carry data-w indices so Flow mode can scroll to and highlight the reader's position */}
              {(() => {
                let w = 0;
                return promptScript.split(/(\s+)/).map((part, i) =>
                  /\S/.test(part) ? <span key={i} data-w={w++}>{part}</span> : part,
                );
              })()}
            </p>
            <div className="h-40" />
          </div>
        )}

        {/* Camera preview fills the remaining space — as large as possible */}
        <div className="relative flex-1 overflow-hidden bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            // Branded preview shows the composited canvas (unmirrored, WYSIWYG);
            // plain preview mirrors like a selfie camera.
            className={cn(
              // contain, not cover, while the composite is running: the
              // composite IS the recording, so cropping it in the preview
              // would show you a frame that is not the one being saved. The
              // black around it is the honest answer — it is what the shape
              // you picked looks like on this screen.
              // Raw recording is shown contained too when the tools are on:
              // object-cover filled a vertical frame with a horizontal camera,
              // which is precisely how a 16:9 take looked like a 9:16 Reel.
              brandedActive || micTools ? "w-full h-full object-contain" : "w-full h-full object-cover",
              // Branded mode previews the actual composite — flipping that
              // would show something the file does not contain.
              !brandedActive && mirrorPreview && "[transform:scaleX(-1)]",
            )}
          />
          {countdown !== null && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45">
              <span className="text-white text-[92px] font-bold leading-none tabular-nums drop-shadow-lg">
                {countdown === 0 ? "Go" : countdown}
              </span>
            </div>
          )}

          {/* Measured, not guessed. Only while framing up — mid-take it would
              be something you cannot act on without starting over. */}
          {!isRecording && countdown === null && brightness !== null && brightness < 0.22 && (
            <div className="absolute bottom-3 left-3 right-3 flex items-start gap-2 rounded-xl bg-amber-500/90 px-3 py-2 backdrop-blur-sm">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-white" />
              <p className="text-[12px] leading-[1.4] text-white">
                It&rsquo;s dark where you are. Face a window or a lamp — never with the light
                behind you — or this will come out grainy.
              </p>
            </div>
          )}

          {/* Mirroring is for the reader, not the recording. Saying so stops
              the obvious worry that the video will come out backwards. */}
          {!brandedActive && !isRecording && countdown === null && (
            <button
              type="button"
              onClick={() => setMirrorPreview((m) => !m)}
              className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm hover:bg-black/80"
              title="Only flips what you see here — the recording is never mirrored"
            >
              {mirrorPreview ? "Mirrored" : "True view"}
            </button>
          )}

          {isRecording && !isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span
                className={cn(
                  "text-xs font-medium font-mono",
                  seconds >= WARN_RECORD_SECONDS ? "text-amber-400" : "text-white",
                )}
              >
                {formatTime(seconds)} / 15:00
              </span>
            </div>
          )}
          {isPaused && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Pause size={11} className="text-yellow-400" />
              <span className="text-white text-xs font-medium">{formatTime(seconds)}</span>
            </div>
          )}

          {/* Pre-record hint, centered over the live camera */}
          {!isRecording && (
            <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-black/70 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3">
              <Video size={15} className="text-primary-300 shrink-0" />
              <p className="text-xs text-white/90">
                Camera Is Live. Press{" "}
                <strong>Start Recording</strong> —{" "}
                {scrollMode === "flow" && flowSupported
                  ? <>The Teleprompter Will <strong>Follow Your Voice</strong> As You Read.</>
                  : <>The Teleprompter Will Scroll Automatically.</>}{" "}
                Record Up To <strong>15 Minutes</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Bottom control bar */}
        <div className="shrink-0 flex flex-col gap-2 bg-black/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Speed control while paused (auto mode only — Flow paces itself) */}
          {isPaused && scrollMode === "auto" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60 shrink-0">Speed:</span>
              {SPEED_OPTIONS.map((opt, i) => (
                <button
                  key={opt.label}
                  onClick={() => setSpeedIdx(i)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all",
                    speedIdx === i
                      ? "border-primary-400 bg-primary-500/20 text-primary-200"
                      : "border-white/20 text-white/60",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* The shape you chose cannot be recorded: stop, explain, and let the
              user decide. Recording horizontal without being asked is the bug
              this replaces. */}
          {shapeUnsafe && !isRecording && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3">
              <p className="flex items-start gap-2 text-[13px] font-semibold text-amber-200">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                Vertical 9:16 can&apos;t be recorded right now
              </p>
              <p className="mt-1 text-[12px] leading-[1.45] text-white/80">
                {compositeFailure ?? "The shaped recorder isn't running."} Recording now would save a
                horizontal 16:9 video from your camera, not the vertical one you picked.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  onClick={() => { closeCamera(); setStep("script"); }}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
                  <RotateCcw size={14} /> Try Again
                </Button>
                <Button
                  onClick={() => { setShape("horizontal"); setRawShapeApproved(true); }}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
                  <Video size={14} /> Record Horizontal Instead
                </Button>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2">
            {!isRecording && (
              <>
                <Button onClick={handleReset} variant="ghost" size="lg" className="gap-2 flex-1 text-white hover:bg-white/10">
                  <RotateCcw size={15} /> Back
                </Button>
                <Button
                  onClick={beginCountdown}
                  disabled={countdown !== null || shapeUnsafe}
                  size="lg"
                  className="gap-2 flex-[2]"
                >
                  <Video size={17} /> {countdown !== null ? "Starting…" : "Start Recording"}
                </Button>
              </>
            )}
            {isRecording && !isPaused && (
              <>
                <Button onClick={pauseRecording} variant="outline" size="lg" className="gap-2 flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20">
                  <Pause size={17} /> Pause
                </Button>
                <Button onClick={stopRecording} variant="danger" size="lg" className="gap-2 flex-1">
                  <Square size={17} /> Stop
                </Button>
              </>
            )}
            {isPaused && (
              <>
                <Button onClick={resumeRecording} variant="primary" size="lg" className="gap-2 flex-1">
                  <Play size={17} /> Resume
                </Button>
                <Button onClick={stopRecording} variant="danger" size="lg" className="gap-2 flex-1">
                  <Square size={17} /> Stop
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Done step ──────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col gap-4">
        {/* The take's own shape, not a fixed 16:9 box.
            This was a landscape frame with object-cover inside it, so a 9:16
            take was cropped to fill it: the video looked horizontal and the
            branding — which sits along the top and bottom of a vertical
            frame — was cut off the sides of the view. The file was correct
            the whole time; this screen was not. */}
        <div
          className="relative mx-auto w-full overflow-hidden rounded-2xl bg-black"
          style={{
            aspectRatio: takeShape ? `${takeShape.width} / ${takeShape.height}` : "16 / 9",
            maxHeight: "70vh",
          }}
        >
          {(takes[viewingTake]?.url ?? videoUrl) && (
            <video
              src={takes[viewingTake]?.url ?? videoUrl ?? undefined}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          )}
        </div>

        {/* What was actually recorded, in pixels. The shape is the one thing
            this screen used to get wrong, so it now says it outright. */}
        {micTools && takeShape && (
          <p className="text-[11.5px] text-spark-ink-muted">
            Recorded {takeShape.width} × {takeShape.height} ·{" "}
            {takeShape.width > takeShape.height
              ? "Horizontal 16:9"
              : takeShape.width < takeShape.height
                ? "Vertical 9:16"
                : "Square 1:1"}
            {takeShape.branded ? " · branded composite" : " · raw camera"}
          </p>
        )}

        {/* Every take from this session. Each is already in My Content on its
            own — this is so two of them can be compared without leaving. */}
        {takes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-spark-ink-muted">Takes</span>
            {takes.map((t, i) => (
              <button
                key={t.url}
                type="button"
                onClick={() => setViewingTake(i)}
                aria-pressed={i === viewingTake}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  i === viewingTake
                    ? "border-spark-amber bg-spark-amber-tint text-spark-ink"
                    : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
                }`}
              >
                {i + 1} · {formatTime(t.seconds)}
              </button>
            ))}
            {/* Was unconditional, which stopped being true the moment a take
                could fail to save. */}
            <span className="text-[11px] text-spark-ink-faint">
              {allTakesSaved ? "all saved" : "not all saved yet"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-semibold text-brand-text">
            {viewedSaved
              ? "Saved to My Content"
              : saving
                ? "Saving to My Content…"
                : viewedRecovery
                  ? "Not saved yet — kept on this device"
                  : "Recording complete"}
          </p>
          <div className="flex items-center gap-3">
            {/* It said the video was in My Content and then offered no way to
                get there — Download, Share and Re-record, all of which keep
                you here. The one thing the sentence promises has to be
                reachable from the sentence. */}
            {viewedSaved && (
              <a
                href={`/videos?highlight=${viewedSaved.videoId}`}
                onClick={() => setOpeningVideo(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-spark-amber hover:text-spark-blue whitespace-nowrap"
              >
                {openingVideo && <Loader2 size={12} className="animate-spin" />}
                {openingVideo ? "Opening…" : "View it →"}
              </a>
            )}
            <span className="text-xs text-slate-400 font-mono">{formatTime(seconds)}</span>
          </div>
        </div>

        {/* After a failed upload, say where the recording actually is.
            Two different facts, and the difference matters: one of them means
            they can close the page, and the other means they cannot. */}
        {viewedRecovery && !viewedSaved && (
          <div className="flex items-start gap-2 rounded-lg bg-spark-amber/5 px-3 py-2.5 text-xs text-slate-600">
            <AlertCircle size={13} className="mt-0.5 shrink-0 text-spark-amber" />
            <div className="flex flex-col gap-1">
              {/* Where it stopped, when that is known — Download and Save to
                  My Content below stay available either way. */}
              {viewedRecovery.lastStage && STAGE_LABELS[viewedRecovery.lastStage as UploadStage] && (
                <span className="font-medium text-red-700">
                  Stopped {STAGE_LABELS[viewedRecovery.lastStage as UploadStage]}.
                </span>
              )}
              {storeUnavailable ? (
                <span>
                  The upload didn&apos;t go through, and your browser wouldn&apos;t store a recovery
                  copy either. This recording only exists in this open page — download it now,
                  or it will be lost when you close or reload.
                </span>
              ) : viewedRecovery.lastStage === "after-save" ? (
                <span>
                  It may already have reached the server — the reply never arrived, so this
                  browser can&apos;t tell. Your recording is safely waiting on this device, and
                  Save to My Content below will check rather than save it twice.
                </span>
              ) : (
                <span>
                  The upload didn&apos;t go through, but your recording is safely waiting on this
                  device. Try again below — you won&apos;t need to record it again.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleDownload} variant="outline" size="lg" className="gap-2">
            <Download size={16} /> Download
          </Button>
          <Button
            onClick={handleSaveForSocial}
            loading={saving}
            size="lg"
            className="gap-2"
          >
            {/* No longer the only route into My Content — takes save
                themselves the moment they finish — so it is the share sheet
                once that has happened, and the retry if it has not. */}
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : (
              <><Share2 size={16} /> {viewedSaved ? "Share it" : "Save to My Content"}</>
            )}
          </Button>
        </div>

        {/* The way through to everything written for this recording.
            The camera route finished here, with Download, Share and
            Re-record — so the titles, description, hashtags and blog article
            that exist for a camera video by this point were on a screen the
            camera route could not reach. Filming it yourself is not a reason
            to lose the writing that goes with it. */}
        {viewedSaved?.projectId && (
          <a
            href={`/create/${viewedSaved.projectId}?step=5`}
            className="flex items-center justify-between gap-3 rounded-xl border border-spark-rule bg-white px-4 py-3 transition-colors hover:border-spark-amber"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-spark-ink">Your Share Kit</span>
              <span className="block text-[11.5px] leading-[1.4] text-spark-ink-muted">
                Title, description and hashtags — plus a blog article you can paste into your site.
              </span>
            </span>
            <ArrowRight size={16} className="shrink-0 text-spark-amber" />
          </a>
        )}

        <Button onClick={handleReset} variant="ghost" size="sm" className="gap-1.5 text-slate-400">
          <RotateCcw size={13} /> Re-record
        </Button>
      </div>

      {showPublish && viewedSaved && (
        <PublishModal
          videoId={viewedSaved.videoId}
          videoTitle={viewedSaved.title || savedTitle}
          onClose={() => setShowPublish(false)}
          onPublished={() => setShowPublish(false)}
        />
      )}
    </>
  );
}
