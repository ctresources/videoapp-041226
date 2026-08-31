"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, AlertCircle, Film, Download } from "lucide-react";
import toast from "react-hot-toast";
import { BrandedComposite, type BrandInfo } from "@/lib/utils/branded-recorder";
import { uploadCameraRecording } from "@/lib/utils/camera-upload";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";

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

type Phase = "pick" | "checking" | "ready" | "rendering" | "done";

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
          .select("full_name, company_name, license_number, phone, location_city, location_state, logo_url, avatar_url")
          .eq("id", user.id)
          .single();
        if (!data) return;
        const p = data as Record<string, string | null>;
        setBrand({
          name: p.full_name, brokerage: p.company_name, license: p.license_number,
          phone: p.phone, city: p.location_city, state: p.location_state,
          logoUrl: p.logo_url, headshotUrl: p.avatar_url,
        });
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
  const musicUrl = (() => {
    const q = MUSIC_PRESETS.find((m) => m.id === musicId)?.query;
    return q ? `/api/music/track?q=${encodeURIComponent(q)}` : null;
  })();

  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [savedId, setSavedId] = useState<string | null>(null);

  const urlRef = useRef<string | null>(null);
  const compositeRef = useRef<BrandedComposite | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement>(null);

  // An object URL outlives the component unless it is handed back.
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    compositeRef.current?.destroy();
  }, []);

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
      const composite = new BrandedComposite(brand, musicUrl, photos);
      const stream = await composite.init(url);
      compositeRef.current = composite;

      // Show the composited canvas, so what is being written is what is on
      // screen — there is no other way to tell it is working.
      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        composite.destroy();
        compositeRef.current = null;
        try {
          const { videoId } = await uploadCameraRecording(blob, {
            title: `${title || fileName} — branded`,
            script: "",
          });
          setSavedId(videoId);
          setPhase("done");
          toast.success("Saved to My Videos.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
          setPhase("ready");
        }
      };

      rec.start(500);
      recorderRef.current = rec;
      composite.startMusic();
      composite.startBroll();

      // The source element lives inside the composite; it is already playing.
      // Progress and the stop trigger both come off it.
      const source = composite.sourceElement;
      if (!source) throw new Error("No source element");
      const tick = setInterval(() => {
        if (source.duration > 0) setProgress(source.currentTime / source.duration);
      }, 250);
      source.onended = () => {
        clearInterval(tick);
        setProgress(1);
        composite.pauseBroll();
        composite.beginEndCard();
        // Hold on the branded end card before finalising, as a live take does.
        setTimeout(() => recorderRef.current?.stop(), 3150);
      };
    } catch (err) {
      compositeRef.current?.destroy();
      compositeRef.current = null;
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
          <p className="text-[11px] leading-[1.45] text-spark-ink-muted">
            Your logo, name bar, photos as b-roll and the end card get burned in. It plays through
            once in real time — about {Math.round(duration)} seconds — so leave this tab open and
            in front until it finishes.
          </p>
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
          </div>

          {/* Said plainly rather than left as a gap someone has to notice.
              Live captions come from listening to a microphone as you speak;
              a file that already exists has no microphone to listen to, and
              transcribing its audio is a separate job this does not do yet. */}
          <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
            No captions on an uploaded clip — those are transcribed live while you speak, so they
            only work when you record here.
          </p>

          <Button onClick={render} size="lg" className="gap-2">
            Brand this clip
          </Button>
        </div>
      )}

      {(phase === "rendering" || phase === "done") && (
        <div className="flex flex-col gap-2">
          <video
            ref={previewRef}
            muted
            playsInline
            className="w-full rounded-xl border border-spark-rule bg-black"
          />
          {phase === "rendering" ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-spark-rule">
                <div
                  className="h-full rounded-full bg-spark-amber transition-[width]"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-spark-ink-muted">
                Branding — {Math.round(progress * 100)}%. Keep this tab in front; switching away
                drops frames from the recording.
              </p>
            </>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
}
