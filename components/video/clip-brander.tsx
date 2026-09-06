"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, AlertCircle, Film, Download } from "lucide-react";
import toast from "react-hot-toast";
import { BrandedComposite, type BrandInfo, type MusicLevel } from "@/lib/utils/branded-recorder";
import { uploadCameraRecording, videoTypeForSize } from "@/lib/utils/camera-upload";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { pickRecordingMimeType, recordedType } from "@/lib/utils/recording-format";
import { resolveCta } from "@/lib/utils/default-cta";
import { WPM } from "@/lib/utils/video-length";
import { LiveTranscriber } from "@/lib/utils/voice-follow";
import { extractSpeechWav, ClipAudioUnavailable } from "@/lib/utils/clip-audio";

/**
 * Two minutes.
 *
 * The compositing runs in real time — a clip is re-recorded as it plays — so
 * the tab has to stay open and in front for the whole of it. Two minutes is
 * about as long as anyone will watch a progress bar without touching
 * anything, and a backgrounded tab throttles requestAnimationFrame, which
 * drops frames into the file rather than failing loudly.
 */
const MAX_SECONDS = 120;
const MAX_MB = 500;

/** The formats a browser can be relied on to decode. */
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

/**
 * "saving" is separate from "rendering" on purpose.
 *
 * The two are wildly different waits and used to look identical: the bar hit
 * 100%, the clip had finished playing, and then the upload ran for another
 * minute with the same frozen progress bar and the same "keep this tab in
 * front" line under it. It read as a hang.
 */
type Phase = "pick" | "checking" | "ready" | "rendering" | "saving" | "done";

/** What came back from reading the clip's own audio. */
type TranscriptState =
  | { status: "off" }
  | { status: "running" }
  | { status: "done"; words: number }
  | { status: "silent" }
  | { status: "failed" };

export function ClipBrander({ photos = [], title }: {
  /** CORS-clean URLs — see /api/photos/rehost. */
  photos?: string[];
  title: string;
}) {
  // Loaded here rather than passed in: the Create page has never needed the
  // logo, licence or headshot, and CameraRecorder already fetches its own the
  // same way. Branding simply proceeds without whatever is missing.
  const [brand, setBrand] = useState<BrandInfo>({});
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("full_name, company_name, license_number, phone, location_city, location_state, logo_url, avatar_url, default_cta, market_years")
          .eq("id", user.id)
          .single();
        if (!data) return;
        const p = data as Record<string, string | null>;
        setBrand({
          name: p.full_name, brokerage: p.company_name, license: p.license_number,
          phone: p.phone, city: p.location_city, state: p.location_state,
          logoUrl: p.logo_url, headshotUrl: p.avatar_url,
        });
        setCtaSource({
          template: p.default_cta, name: p.full_name,
          company: p.company_name, years: p.market_years,
        });
        // Seeds the market fields, which stay editable: this clip is often a
        // listing in a town the agent does not live in, and the market is not
        // only a label — it is the town the end card offers more videos about.
        setCity((c) => c || p.location_city || "");
        setState((s) => s || p.location_state || "");
      } catch { /* brand overlays simply stay empty */ }
    })();
  }, []);

  /**
   * Music is chosen here rather than passed in.
   *
   * The first cut took a musicUrl prop and the caller hardcoded null, so there
   * was no music and no way to ask for any — the bed was silently impossible
   * rather than merely off.
   */
  const [musicId, setMusicId] = useState("none");
  /**
   * Chosen before the render rather than discovered after it: the only way to
   * hear the mix is to sit through a real-time playback of the whole clip, so
   * "a bit louder" should not cost another two minutes to find out.
   */
  const [musicLevel, setMusicLevel] = useState<MusicLevel>("medium");

  // ── What the video is, collected before it renders ───────────────────────
  //
  // An uploaded clip is the one video the app cannot describe for itself: the
  // camera tab has the script that was read, and every rendered video has the
  // script it was written from, but this clip's words are still inside its
  // audio. Without these it reached My Videos as a filename with nothing to
  // post it with, and with the agent's home town on the end card whatever the
  // footage was of.
  const [videoTitle, setVideoTitle] = useState("");
  const [hook, setHook] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addCta, setAddCta] = useState(true);
  const [ctaSource, setCtaSource] = useState<{
    template: string | null; name: string | null;
    company: string | null; years: string | null;
  } | null>(null);

  /**
   * The sign-off as it will appear in the description.
   *
   * Post copy only, deliberately. On screen it would repeat the end card
   * almost line for line — both ask for a follow, both give the name — and it
   * is four paragraphs of prose, which is not a caption. The end card is the
   * on-screen ask; this fills the description it points at.
   */
  const resolvedCta = ctaSource
    ? resolveCta(ctaSource.template, {
        city: city || null, state: state || null,
        name: ctaSource.name, company: ctaSource.company, years: ctaSource.years,
      })
    : "";
  const musicUrl = (() => {
    const q = MUSIC_PRESETS.find((m) => m.id === musicId)?.query;
    return q ? `/api/music/track?q=${encodeURIComponent(q)}` : null;
  })();

  /**
   * The unbranded cut most MLS boards require of listing media: no logo, no
   * name bar, no licence, no end card. Music and photo b-roll stay — neither
   * identifies the agent — so this is a narrower thing than switching the
   * composite off.
   */
  const [unbranded, setUnbranded] = useState(false);

  /**
   * Start fetching the track the moment it is picked, not when Render is
   * pressed.
   *
   * Resolving a preset against HeyGen's catalog and proxying the audio is slow
   * on a cold request, and it otherwise happens inside the render, where the
   * whole thing is waiting on it. The route sends Cache-Control, so by the time
   * the button is pressed the browser usually has the bytes already.
   */
  useEffect(() => {
    if (!musicUrl) return;
    const warm = new Audio();
    warm.preload = "auto";
    warm.src = musicUrl;
    warm.load();
    return () => { warm.src = ""; };
  }, [musicUrl]);

  // ── Picture and voice are separate decisions ─────────────────────────────
  //
  // Not a branch on whether the clip has audio. A silent walkthrough and one
  // whose narration was flubbed need the identical thing — new words over
  // existing footage — and the only difference between them is whether there
  // was something to discard. Detecting audio would set the default at most;
  // it does not decide what you are allowed to do.
  const [voiceMode, setVoiceMode] = useState<"keep" | "narrate">("keep");
  const [script, setScript] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState(true);
  const fileRef = useRef<File | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const teleRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptState>({ status: "off" });

  /**
   * How many words fit the footage, at normal speaking pace.
   *
   * The new narration cannot run longer than the picture it sits under — the
   * clip ends when it ends, and anything still being read is simply cut off.
   * So the budget is the clip's own length, not a length the writer chose.
   */
  const wordBudget = Math.round((duration / 60) * WPM);
  const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
  const overBudget = wordBudget > 0 && scriptWords > wordBudget * 1.05;

  /**
   * Read the clip's own audio, once it is saved and reachable by URL.
   *
   * Deliberately after the save rather than at the point the file is picked:
   * the recording is already in storage by then, so the server transcribes it
   * from there instead of a 500 MB walkthrough having to fit through a request
   * body. It runs on its own and never blocks the save — the video is in My
   * Videos and playable whatever happens here.
   */
  async function readClipAudio(videoId: string) {
    setTranscript({ status: "running" });
    try {
      const res = await fetch("/api/video/transcribe-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      const data = await res.json();
      // A silent walkthrough is a normal thing to have shot, not a failure.
      if (data?.silent) return setTranscript({ status: "silent" });
      if (!res.ok) throw new Error(data?.error || "Transcription failed");
      setTranscript({ status: "done", words: Number(data.words) || 0 });
    } catch {
      setTranscript({ status: "failed" });
    }
  }

  /** Everything the new-voiceover path holds open. Safe to call twice. */
  function stopNarration() {
    transcriberRef.current?.stop();
    transcriberRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
  }

  const urlRef = useRef<string | null>(null);
  const compositeRef = useRef<BrandedComposite | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement>(null);

  // An object URL outlives the component unless it is handed back.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    compositeRef.current?.destroy();
    stopNarration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * The words already in the clip, as the first draft of the new ones.
   *
   * Someone re-recording a voiceover is nearly always fixing a take, not
   * starting again — so the useful starting point is what they said the first
   * time, with the stumble in it, ready to be edited out. A blank box asks
   * them to reconstruct from memory something they have a recording of.
   *
   * The audio is decoded here and only the speech is sent, which is what keeps
   * a 300 MB walkthrough from having to reach a server at all.
   */
  async function fetchDraftScript() {
    const file = fileRef.current;
    if (!file) return;
    setDraftLoading(true);
    setError(null);
    try {
      const wav = await extractSpeechWav(file);
      const form = new FormData();
      form.append("audio", wav, "clip.wav");
      const res = await fetch("/api/voice/quick-transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not read the audio");
      const text = (data.transcript as string || "").trim();
      if (!text) {
        setError("No speech found in that clip — type or paste what you want to say instead.");
        return;
      }
      setScript(text);
      toast.success("Loaded what the clip says — edit it, then record.");
    } catch (err) {
      setError(
        err instanceof ClipAudioUnavailable
          ? `${err.message} Type or paste your script instead.`
          : err instanceof Error ? err.message : "Could not read the audio",
      );
    } finally {
      setDraftLoading(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError(`${file.type || "That file"} isn't a video this can read. Use MP4, MOV or WebM.`);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${MAX_MB} MB.`);
      return;
    }

    setPhase("checking");
    setFileName(file.name);
    // Held so the draft script can be read out of the same file later, without
    // asking for it a second time.
    fileRef.current = file;
    // A filename is a starting point, not a title — "24 Shagbark Ct E.mp4" is
    // closer to useful than "Camera Recording", and it is there to be typed
    // over rather than accepted.
    setVideoTitle((t) => t || title || file.name.replace(/\.[^./\\]+$/, ""));
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;

    // Duration has to come from the browser, not the file size — and this is
    // also the first honest test of whether it can decode the thing at all.
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.src = url;
    const secs = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => resolve(-1), 8000);
      probe.onloadedmetadata = () => { clearTimeout(timer); resolve(probe.duration); };
      probe.onerror = () => { clearTimeout(timer); resolve(-1); };
    });

    if (secs < 0 || !Number.isFinite(secs)) {
      // Usually HEVC from an iPhone set to "High Efficiency".
      setError("This browser can't read that video. Re-export it as H.264 MP4 and try again.");
      setPhase("pick");
      return;
    }
    if (secs > MAX_SECONDS) {
      setError(
        `That clip is ${Math.round(secs)}s. This tool handles up to ${MAX_SECONDS}s — ` +
        `it re-records the video as it plays, so anything longer means sitting here too long.`,
      );
      setPhase("pick");
      return;
    }
    setDuration(secs);
    setPhase("ready");
  }

  async function render() {
    const url = urlRef.current;
    if (!url) return;
    setPhase("rendering");
    setProgress(0);
    chunksRef.current = [];

    try {
      // Asked for before anything starts. A permission prompt appearing after
      // the clip is already playing would cost the opening line, and the clip
      // only plays once.
      let mic: MediaStream | null = null;
      if (voiceMode === "narrate") {
        try {
          mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        } catch {
          setError("Microphone access is needed to record a new voiceover.");
          setPhase("ready");
          return;
        }
        micRef.current = mic;
      }

      // The market fields override the profile's, because the end card offers
      // "more real estate in {city}" and that should be the town this footage
      // is of, not the town the agent happens to work from.
      const composite = new BrandedComposite(
        { ...brand, city: city || brand.city, state: state || brand.state },
        musicUrl, photos, unbranded, musicLevel,
      );
      const stream = await composite.init(url, { narrateWith: mic });
      compositeRef.current = composite;

      // Burned-in captions come free with a re-recorded voiceover and only
      // then: they are transcribed from a microphone as it is spoken into,
      // and a clip that already exists has no microphone to listen to.
      if (mic && liveCaptions) {
        const transcriber = new LiveTranscriber(
          (text) => composite.setCaption(text),
          () => toast("Live captions aren't supported in this browser.", { icon: "💬" }),
        );
        transcriber.start();
        transcriberRef.current = transcriber;
      }

      // Show the composited canvas, so what is being written is what is on
      // screen — there is no other way to tell it is working.
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }

      const mimeType = pickRecordingMimeType();
      const rec = new MediaRecorder(stream, {
        // Omitted rather than forced: a browser that supports none of the
        // candidates will pick its own, and naming an unsupported type here
        // throws before recording ever starts.
        ...(mimeType ? { mimeType } : {}),
        // Capped, like the camera recorder. This asked for nothing at all, so
        // the browser picked its own rate — often 5-8 Mbps at 1080p — and a
        // branded clip came out as large as it felt like making it.
        videoBitsPerSecond: 1_600_000,
        audioBitsPerSecond: 128_000,
      });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recordedType(rec, mimeType) });
        // Read before destroy() drops the canvas — it is the only record of
        // what shape this recording actually came out.
        const size = composite.dimensions;
        composite.destroy();
        compositeRef.current = null;
        stopNarration();
        setPhase("saving");
        try {
          const { videoId } = await uploadCameraRecording(blob, {
            // The suffix is how the two cuts of the same clip are told apart in
            // My Videos, where they are otherwise the same title twice.
            title: `${videoTitle.trim() || title || fileName} — ${unbranded ? "unbranded" : "branded"}`,
            hook: hook.trim(),
            city: city.trim(),
            state: state.trim(),
            // An unbranded cut may not carry the ask anywhere, including the
            // caption it gets published with.
            cta: addCta && !unbranded ? resolvedCta : "",
            // Without this every branded clip was filed under the save route's
            // "reel_9x16" default, so a landscape walkthrough came back playing
            // letterboxed inside a portrait frame. The file was always correct;
            // only the label was wrong.
            videoType: videoTypeForSize(size),
            // What was actually said. On a re-recorded voiceover that is the
            // script just read, which is better than any transcription of it —
            // so the description is written from the words themselves.
            script: voiceMode === "narrate" ? script.trim() : "",
          });
          setSavedId(videoId);
          setPhase("done");
          toast.success("Saved to My Videos.");
          // Not awaited: the save is complete and the video is watchable. This
          // fills in the captions and the description behind it.
          void readClipAudio(videoId);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
          setPhase("ready");
        }
      };

      // Said out loud, as the camera tab already does. A track that fails to
      // load leaves the composite recording in silence, and this panel used to
      // let that pass without a word — indistinguishable from never having
      // picked one.
      if (composite.musicUnavailable) {
        toast("That music track wouldn't load — branding this clip without a music bed.", {
          icon: "🎵", duration: 6000,
        });
      }

      rec.start(500);
      recorderRef.current = rec;
      composite.startMusic();
      composite.startBroll();

      // The source element lives inside the composite; it is already playing.
      // Progress and the stop trigger both come off it.
      const source = composite.sourceElement;
      if (!source) throw new Error("No source element");
      const tick = setInterval(() => {
        if (source.duration <= 0) return;
        const at = source.currentTime / source.duration;
        setProgress(at);
        // The prompter is paced by the footage rather than by a speed setting,
        // which is the whole point here: the words have to land with the
        // picture, and the picture is the thing that cannot be slowed down.
        // Reaching the end of the script early means slow down, and that is
        // information worth having while there is still time to act on it.
        const el = teleRef.current;
        if (el) {
          const travel = el.scrollHeight - el.clientHeight;
          if (travel > 0) el.scrollTop = travel * Math.min(1, at);
        }
      }, 100);
      source.onended = () => {
        clearInterval(tick);
        setProgress(1);
        composite.pauseBroll();
        composite.beginEndCard();
        // Hold on the branded end card before finalising, as a live take does.
        // An unbranded cut has no card to hold on, so the same wait would only
        // staple three seconds of a frozen last frame onto the end.
        setTimeout(() => recorderRef.current?.stop(), composite.showsEndCard ? 3150 : 250);
      };
    } catch (err) {
      compositeRef.current?.destroy();
      compositeRef.current = null;
      stopNarration();
      setError(err instanceof Error ? err.message : "Could not brand that clip");
      setPhase("ready");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12.5px] leading-[1.45] text-amber-900">{error}</p>
        </div>
      )}

      {(phase === "pick" || phase === "checking") && (
        <label
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
            phase === "checking"
              ? "border-spark-rule-dim bg-spark-amber-tint"
              : "border-spark-rule hover:border-spark-rule-dim"
          }`}
        >
          {phase === "checking"
            ? <Loader2 size={22} className="animate-spin text-spark-amber" />
            : <Upload size={22} className="text-spark-ink-faint" />}
          <span className="text-sm font-semibold text-spark-ink-soft">
            {phase === "checking" ? "Reading that clip…" : "Choose a clip you already shot"}
          </span>
          <span className="text-[11px] text-spark-ink-faint">
            MP4, MOV or WebM · up to {MAX_SECONDS}s · max {MAX_MB} MB
          </span>
          <input
            type="file"
            accept={ACCEPTED.join(",")}
            className="sr-only"
            disabled={phase === "checking"}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </label>
      )}

      {phase === "ready" && (
        <div className="flex flex-col gap-2 rounded-xl border border-spark-rule p-3">
          <div className="flex items-center gap-2">
            <Film size={15} className="shrink-0 text-spark-amber" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-spark-ink">{fileName}</p>
            <span className="text-[11px] text-spark-ink-faint">{Math.round(duration)}s</span>
          </div>
          {/* Names only what this particular clip will actually get. It used
              to promise "photos as b-roll" to everyone, including the many
              people branding a clip with no photos attached at all — who then
              watched for something that was never going to appear. */}
          <p className="text-[11px] leading-[1.45] text-spark-ink-muted">
            {(() => {
              const layers = [
                ...(unbranded
                  ? []
                  : [
                      "your logo",
                      brand.headshotUrl ? "your photo and name bar" : "name bar",
                    ]),
                ...(photos.length > 0 ? [`your ${photos.length} photos as b-roll`] : []),
                ...(musicUrl ? ["the music bed"] : []),
                ...(unbranded ? [] : ["the end card"]),
              ];
              const list = layers.length > 1
                ? `${layers.slice(0, -1).join(", ")} and ${layers[layers.length - 1]}`
                : layers[0];
              return layers.length === 0
                ? "Nothing is being added — this will re-record the clip as it is."
                : `${list.charAt(0).toUpperCase()}${list.slice(1)} get burned in.`;
            })()}{" "}
            It plays through once in real time — about {Math.round(duration)} seconds — so leave
            this tab open and in front until it finishes.
          </p>

          {/* MLS listing media generally may not identify the agent. The toggle
              lives beside the render button rather than in settings because it
              is a per-video decision: the same walkthrough is usually wanted
              both ways, one cut for the board and one for social. */}
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-spark-rule px-2.5 py-2">
            <input
              type="checkbox"
              checked={unbranded}
              onChange={(e) => setUnbranded(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-spark-amber"
            />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold text-spark-ink">
                Unbranded cut for the MLS
              </span>
              <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">
                Leaves out your logo, name bar, licence and contact end card. Check what your board
                requires — the rules vary.
              </span>
            </span>
          </label>
          {/* Picture and voice are separate decisions. This is the voice one,
              and it is deliberately not phrased around whether the clip has
              audio: a silent walkthrough and a flubbed one want the same
              thing, and only differ in whether anything is being discarded. */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">Voice</p>
            <div className="grid grid-cols-2 gap-1.5">
              {([
                { id: "keep", label: "Keep the clip's audio", note: "What you said on the day." },
                { id: "narrate", label: "Record a new voiceover", note: "Read over the footage." },
              ] as const).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVoiceMode(v.id)}
                  aria-pressed={voiceMode === v.id}
                  className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                    voiceMode === v.id
                      ? "border-spark-amber bg-spark-amber-tint"
                      : "border-spark-rule bg-white hover:border-spark-rule-dim"
                  }`}
                >
                  <span className="block text-[12px] font-semibold text-spark-ink">{v.label}</span>
                  <span className="block text-[10.5px] text-spark-ink-faint">{v.note}</span>
                </button>
              ))}
            </div>
          </div>

          {voiceMode === "narrate" && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-spark-rule bg-spark-amber-tint/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-spark-ink-muted">Your script</p>
                <button
                  type="button"
                  onClick={fetchDraftScript}
                  disabled={draftLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-spark-rule bg-white px-2 py-1 text-[11px] font-medium text-spark-ink-muted transition-colors hover:border-spark-rule-dim disabled:opacity-50"
                >
                  {draftLoading && <Loader2 size={11} className="animate-spin text-spark-amber" />}
                  {draftLoading ? "Reading the clip…" : "Use the words already in this clip"}
                </button>
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={5}
                placeholder="What you want to say over this footage. Start from what the clip already says, then fix the bit you fluffed."
                className="resize-y rounded-lg border border-spark-rule bg-white px-2.5 py-2 text-[13px] leading-[1.5] text-spark-ink outline-none focus:border-spark-amber"
              />
              {/* The budget is the footage, not a preference. Whatever is still
                  being read when the picture ends is simply not in the video. */}
              <p className={`text-[11px] leading-[1.45] ${overBudget ? "font-medium text-amber-700" : "text-spark-ink-faint"}`}>
                {scriptWords} of about {wordBudget} words — {Math.round(duration)}s of footage at a
                normal speaking pace.
                {overBudget && " That is longer than the clip. The end will be cut off mid-sentence."}
              </p>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={liveCaptions}
                  onChange={(e) => setLiveCaptions(e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-spark-amber"
                />
                <span className="text-[11px] leading-[1.45] text-spark-ink-muted">
                  <strong className="font-semibold text-spark-ink">Burn in captions</strong> as you
                  speak — possible here only because you are the one talking.{" "}
                  <span className="text-spark-ink-faint">A misheard word is permanent.</span>
                </span>
              </label>
              <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
                The footage plays muted while you read. It runs once, in real time, and there is no
                pausing — the clip does not wait.
              </p>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-spark-ink-muted mb-1.5">Music bed</p>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_PRESETS.filter((m) => m.id !== "custom").map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMusicId(m.id)}
                  aria-pressed={musicId === m.id}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    musicId === m.id
                      ? "border-spark-amber bg-spark-amber-tint text-spark-ink"
                      : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
                  }`}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>

            {/* Only worth showing once there is a bed to set the level of. */}
            {musicUrl && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-[11px] font-semibold text-spark-ink-muted">Level</p>
                <div className="flex gap-1.5">
                  {([
                    { id: "quiet", label: "Quiet" },
                    { id: "medium", label: "Medium" },
                    { id: "loud", label: "Loud" },
                  ] as const).map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setMusicLevel(l.id)}
                      aria-pressed={musicLevel === l.id}
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        musicLevel === l.id
                          ? "border-spark-amber bg-spark-amber-tint text-spark-ink"
                          : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-spark-ink-faint">
                  {musicLevel === "loud"
                    ? "For footage with little or no talking."
                    : "Sits under the clip's own sound."}
                </p>
              </div>
            )}
          </div>

          {/* The distinction that still holds: captions can be BURNED IN only
              while a microphone is being listened to live. An uploaded clip's
              audio is read after the fact instead, which produces captions you
              can attach and correct, but not ones baked into the picture. */}
          <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
            The audio gets read once this is saved, which writes the captions, description and
            hashtags. They come as a caption file to attach rather than burned into the picture —
            that only works when a microphone is being listened to live.
          </p>

          {/* Collected before the render, because two of these four are baked
              into the picture: the market is the town the end card offers more
              videos about, and none of it can be added afterwards without
              playing the whole clip through again. */}
          <div className="mt-1 flex flex-col gap-2 border-t border-spark-rule pt-2.5">
            <p className="text-[11px] font-semibold text-spark-ink-muted">About this video</p>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-spark-ink-faint">Title</span>
              <input
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="24 Shagbark Court — kitchen and main floor"
                maxLength={120}
                className="rounded-lg border border-spark-rule px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-spark-ink-faint">
                Hook <span className="text-spark-ink-faint">— the opening line of the caption</span>
              </span>
              <textarea
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                rows={2}
                placeholder="Just listed in Blue Bell — wait until you see this kitchen."
                maxLength={400}
                className="resize-y rounded-lg border border-spark-rule px-2.5 py-1.5 text-[13px] leading-[1.45] text-spark-ink outline-none focus:border-spark-amber"
              />
            </label>

            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] text-spark-ink-faint">City</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Blue Bell"
                  maxLength={100}
                  className="w-full rounded-lg border border-spark-rule px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
                />
              </label>
              <label className="flex w-24 shrink-0 flex-col gap-1">
                <span className="text-[11px] text-spark-ink-faint">State</span>
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="PA"
                  maxLength={50}
                  className="w-full rounded-lg border border-spark-rule px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
                />
              </label>
            </div>
            <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
              {unbranded
                ? "Used for the caption. Your usual sign-off is off on an unbranded cut."
                : <>The end card offers more videos about this town, so set it to the property&rsquo;s
                    market rather than your own if they differ.</>}
            </p>

            {/* Post copy only. On screen it would repeat the end card almost
                line for line, and it is four paragraphs — not a caption. */}
            {!unbranded && resolvedCta && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-spark-rule px-2.5 py-2">
                <input
                  type="checkbox"
                  checked={addCta}
                  onChange={(e) => setAddCta(e.target.checked)}
                  className="mt-0.5 size-3.5 shrink-0 accent-spark-amber"
                />
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold text-spark-ink">
                    Add my usual sign-off to the caption
                  </span>
                  <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">
                    Goes in the description you publish with, not on screen — the end card already
                    carries the ask there.
                  </span>
                  {addCta && (
                    <span className="mt-1.5 block max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-spark-amber-tint px-2 py-1.5 text-[11px] leading-[1.5] text-spark-ink-soft">
                      {resolvedCta}
                    </span>
                  )}
                </span>
              </label>
            )}
          </div>

          <Button
            onClick={render}
            size="lg"
            className="gap-2"
            disabled={voiceMode === "narrate" && !script.trim()}
          >
            {voiceMode === "narrate"
              ? "Record the voiceover"
              : unbranded ? "Render unbranded cut" : "Brand this clip"}
          </Button>
        </div>
      )}

      {(phase === "rendering" || phase === "saving" || phase === "done") && (
        <div className="flex flex-col gap-2">
          <video
            ref={previewRef}
            muted
            playsInline
            className="w-full rounded-xl border border-spark-rule bg-black"
          />
          {/* The prompter, paced by the footage. Sits under the preview rather
              than over it: the picture is what the words have to match, and
              covering it would be reading blind. */}
          {phase === "rendering" && voiceMode === "narrate" && (
            <div
              ref={teleRef}
              className="max-h-44 overflow-hidden rounded-xl border border-spark-rule bg-spark-ink px-4 py-3"
            >
              <p className="whitespace-pre-wrap text-center text-[19px] font-semibold leading-[1.55] text-white">
                {script}
              </p>
              {/* Read-ahead room, so the last line can reach the middle of the
                  box rather than stopping at the bottom edge. */}
              <div className="h-20" />
            </div>
          )}

          {phase === "rendering" ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-spark-rule">
                <div
                  className="h-full rounded-full bg-spark-amber transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-spark-ink-muted">
                {unbranded ? "Rendering" : "Branding"} — {Math.round(progress * 100)}%. Keep this
                tab in front; switching away
                drops frames from the recording.
              </p>
            </>
          ) : phase === "saving" ? (
            /* Its own state, because it is its own wait. A finished bar sitting
               at 100% for a minute with "keep this tab in front" under it reads
               as a hang, and the tab no longer needs to be in front at all. */
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="shrink-0 animate-spin text-spark-amber" />
              <p className="text-[12px] text-spark-ink-muted">
                Rendered. Uploading to My Videos — this can take a minute on a long clip, and you
                can switch tabs now.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <p className="flex-1 text-[13px] font-semibold text-spark-ink">Saved to My Videos</p>
                {savedId && (
                  <a href={`/videos?highlight=${savedId}`}>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Download size={13} /> View it
                    </Button>
                  </a>
                )}
              </div>
              {/* Reported rather than run silently: it costs a transcription,
                  it takes a moment, and its result is the difference between a
                  video you can publish and one you have to write copy for. */}
              {transcript.status !== "off" && (
                <div className="flex items-start gap-1.5 text-[11px] leading-[1.45] text-spark-ink-muted">
                  {transcript.status === "running" && (
                    <>
                      <Loader2 size={12} className="mt-0.5 shrink-0 animate-spin text-spark-amber" />
                      <span>Reading the audio — this writes the captions and the description.</span>
                    </>
                  )}
                  {transcript.status === "done" && (
                    <span>
                      Audio read — {transcript.words} words. Captions, description and hashtags are
                      ready, and you can correct the words under <strong>Edit transcript</strong>.
                    </span>
                  )}
                  {transcript.status === "silent" && (
                    <span>No speech in this clip, so there is nothing to caption or describe.</span>
                  )}
                  {transcript.status === "failed" && (
                    <span>
                      Couldn&rsquo;t read the audio this time — the video is saved. Try{" "}
                      <strong>Edit transcript</strong> on it in My Videos.
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
