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
  Video,
  Share2,
  Lightbulb,
  Megaphone,
  Film,
} from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { resolveCta } from "@/lib/utils/default-cta";
import { uploadCameraRecording, videoTypeForSize } from "@/lib/utils/camera-upload";
import { pickRecordingMimeType, recordedType } from "@/lib/utils/recording-format";
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
    where: "Reels, TikTok, Shorts",
    tip: "Hold your phone upright, the way you normally would.",
  },
  {
    key: "horizontal" as const,
    label: "Horizontal",
    ratio: "16:9",
    where: "YouTube, your website",
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

export function CameraRecorder({ city, state, initialScript, initialUnbranded = false, scriptLength, onScriptLengthChange, photos = [], onPhaseChange }: {
  city?: string; state?: string; initialScript?: string;
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
}) {
  const [step, setStep] = useState<CamStep>("script");
  const [script, setScript] = useState(initialScript ?? "");

  useEffect(() => {
    if (initialScript) setScript(initialScript);
  }, [initialScript]);

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
   * The take's real pixel shape, captured while the camera is still open.
   *
   * The upload runs from an effect on the finished blob, by which point
   * onstop has already called closeCamera() — the composite is destroyed and
   * the camera track has ended, so neither can be asked any more. Without a
   * shape the save route falls back to a 9:16 reel, which is how a 1920x1080
   * webcam take ended up playing letterboxed inside a portrait frame.
   */
  const recordedSizeRef = useRef<{ width: number; height: number } | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const stoppingRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);
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
   * going to My Videos and back. They are all saved either way — this is about
   * being able to look at them here before deciding.
   */
  const [takes, setTakes] = useState<{ url: string; blob: Blob; seconds: number }[]>([]);
  const [viewingTake, setViewingTake] = useState(0);
  const [savedTitle, setSavedTitle] = useState("Camera Recording");
  const [showPublish, setShowPublish] = useState(false);
  const [ctaProfile, setCtaProfile] = useState<{
    full_name: string | null; company_name: string | null;
    location_city: string | null; location_state: string | null;
    default_cta: string | null; market_years: string | null;
    avatar_url: string | null; logo_url: string | null;
    license_number: string | null; phone: string | null;
  } | null>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      // What the device is actually giving us, for the rotate warning above.
      const camSettings = stream.getVideoTracks()[0]?.getSettings();
      if (camSettings?.width && camSettings?.height) {
        setCamLandscape(camSettings.width >= camSettings.height);
      }

      // Branded Look: route the camera through the compositing canvas so the
      // preview shows exactly what gets recorded. Any failure falls back to
      // the plain path — the recording itself is never blocked.
      let previewStream: MediaStream = stream;
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
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      setCamError(
        msg.includes("permission") || msg.includes("notallowed") || msg.includes("denied")
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
      setVideoBlob(blob);
      setVideoUrl(url);
      // Kept rather than replaced. Each is saved to My Videos on its own, but
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

    if (scrollMode === "flow" && flowSupported) {
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
   * Put the take in My Videos.
   *
   * `openShare` is what the button passes. The automatic save below does not —
   * a share sheet appearing unasked, over a take nobody has watched yet, is
   * startling.
   */
  async function saveTake(blob: Blob, openShare: boolean) {
    setSaving(true);
    try {
      const title = script.split(/\n/)[0].slice(0, 100).trim() || "Camera Recording";
      const { videoId, title: savedName } = await uploadCameraRecording(blob, {
        title, script, videoType: videoTypeForSize(recordedSizeRef.current),
      });
      setSavedVideoId(videoId);
      setSavedTitle(savedName);
      if (openShare) setShowPublish(true);
      return videoId;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveForSocial() {
    if (!videoBlob) return;
    // Already saved by the effect below — this is only the share sheet now.
    if (savedVideoId) { setShowPublish(true); return; }
    await saveTake(videoBlob, true);
  }

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
   * kept the footage. A retake now costs a spare row in My Videos, which is a
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
      const id = await saveTake(videoBlob, false);
      if (id) toast.success("Saved to My Videos.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoBlob]);

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

  // ── Script step ─────────────────────────────────────────────────────────────
  if (step === "script") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-semibold text-brand-text">Your Script</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSpark((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
              >
                <Sparkles size={12} />
                {showSpark ? "Hide" : "Spark with AI"}
              </button>
            </div>
          </div>

          {showSpark && (
            <div className="mb-3 p-3 bg-primary-50 border border-primary-100 rounded-xl">
              <TopicRadar city={city} state={state} onSelect={(t) => setSparkTopic(t)} />

              {/* Script length — recordings are free, so pick whatever fits */}
              <div className="mt-2">
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Script Length</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CAMERA_LENGTHS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setSparkLength(l.key)}
                      className={`px-2 py-1.5 rounded-lg border text-center transition-colors ${
                        sparkLength === l.key
                          ? "border-primary-500 bg-white"
                          : "border-primary-200 bg-white/60 hover:border-primary-300"
                      }`}
                    >
                      <span className="block text-[11px] font-bold text-brand-text">{l.label}</span>
                      <span className="block text-[10px] text-slate-500">{l.minutes} min</span>
                    </button>
                  ))}
                </div>
              </div>

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
              placeholder="Type your script, or tap the mic to speak it…"
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

        {/* ── Shape ──
            Chosen before recording rather than read off the finished file.
            Cropping a portrait take into landscape afterwards loses your head
            and your feet — the information was never captured — so the only
            way to get a good landscape video is to frame one. */}
        {brandedSupported && (
          <div className="rounded-xl border border-spark-rule p-3.5">
            <p className="mb-2 text-sm font-semibold text-brand-text">Shape</p>
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
            <li>End with a subscribe CTA — tap <strong>Add Channel CTA</strong> above to drop yours into the script so the teleprompter reads it for you</li>
          </ul>
        </div>

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
          disabled={!script.trim()}
        >
          <Camera size={18} /> Open Camera
        </Button>
        {!script.trim() ? (
          <p className="text-xs text-slate-400 text-center -mt-3">
            Add A Script Above To Continue
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
            you read while looking at the camera. Shown once recording starts. */}
        {isRecording && (
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
                return script.split(/(\s+)/).map((part, i) =>
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
              brandedActive ? "w-full h-full object-contain" : "w-full h-full object-cover",
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

          {/* Controls */}
          <div className="flex gap-2">
            {!isRecording && (
              <>
                <Button onClick={handleReset} variant="ghost" size="lg" className="gap-2 flex-1 text-white hover:bg-white/10">
                  <RotateCcw size={15} /> Back
                </Button>
                <Button
                  onClick={beginCountdown}
                  disabled={countdown !== null}
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
        <div className="relative bg-black rounded-2xl overflow-hidden aspect-video">
          {(takes[viewingTake]?.url ?? videoUrl) && (
            <video
              src={takes[viewingTake]?.url ?? videoUrl ?? undefined}
              controls
              playsInline
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Every take from this session. Each is already in My Videos on its
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
            <span className="text-[11px] text-spark-ink-faint">all saved</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-sm font-semibold text-brand-text">
            {savedVideoId
              ? "Saved to My Videos"
              : saving
                ? "Saving to My Videos…"
                : "Recording complete"}
          </p>
          <div className="flex items-center gap-3">
            {/* It said the video was in My Videos and then offered no way to
                get there — Download, Share and Re-record, all of which keep
                you here. The one thing the sentence promises has to be
                reachable from the sentence. */}
            {savedVideoId && (
              <a
                href={`/videos?highlight=${savedVideoId}`}
                className="text-xs font-semibold text-spark-amber hover:text-spark-blue whitespace-nowrap"
              >
                View it →
              </a>
            )}
            <span className="text-xs text-slate-400 font-mono">{formatTime(seconds)}</span>
          </div>
        </div>

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
            {/* No longer the only route into My Videos — takes save
                themselves the moment they finish — so it is the share sheet
                once that has happened, and the retry if it has not. */}
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving…</>
            ) : (
              <><Share2 size={16} /> {savedVideoId ? "Share it" : "Save to My Videos"}</>
            )}
          </Button>
        </div>

        <Button onClick={handleReset} variant="ghost" size="sm" className="gap-1.5 text-slate-400">
          <RotateCcw size={13} /> Re-record
        </Button>
      </div>

      {showPublish && savedVideoId && (
        <PublishModal
          videoId={savedVideoId}
          videoTitle={savedTitle}
          onClose={() => setShowPublish(false)}
          onPublished={() => setShowPublish(false)}
        />
      )}
    </>
  );
}
