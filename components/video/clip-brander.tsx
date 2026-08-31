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
      // The market fields override the profile's, because the end card offers
      // "more real estate in {city}" and that should be the town this footage
      // is of, not the town the agent happens to work from.
      const composite = new BrandedComposite(
        { ...brand, city: city || brand.city, state: state || brand.state },
        musicUrl, photos, unbranded, musicLevel,
      );
      const stream = await composite.init(url);
      compositeRef.current = composite;

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
      });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recordedType(rec, mimeType) });
        // Read before destroy() drops the canvas — it is the only record of
        // what shape this recording actually came out.
        const size = composite.dimensions;
        composite.destroy();
        compositeRef.current = null;
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
        if (source.duration > 0) setProgress(source.currentTime / source.duration);
      }, 250);
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
                ...(unbranded ? [] : ["your logo", "name bar"]),
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

          {/* Said plainly rather than left as a gap someone has to notice.
              Live captions come from listening to a microphone as you speak;
              a file that already exists has no microphone to listen to, and
              transcribing its audio is a separate job this does not do yet. */}
          <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
            No captions on an uploaded clip — those are transcribed live while you speak, so they
            only work when you record here.
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

          <Button onClick={render} size="lg" className="gap-2">
            {unbranded ? "Render unbranded cut" : "Brand this clip"}
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
