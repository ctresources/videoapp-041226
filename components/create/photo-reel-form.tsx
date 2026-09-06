"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X, Mic, Square, AlertCircle, Film, ChevronUp, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { uploadVideoPhoto, assertPhotoUploadAllowed, currentUserId } from "@/lib/utils/upload-photo";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { WPM } from "@/lib/utils/video-length";

const MAX_PHOTOS = 12;

/**
 * 9:16 first, because that is where a property reel goes.
 *
 * The three are offered rather than inferred: there is no source clip here to
 * take a shape from, so something has to choose, and it should be the person
 * who knows where they are posting it.
 */
const FORMATS = [
  { id: "reel_9x16", label: "Reel", ratio: "9:16", note: "Instagram, TikTok, Shorts" },
  { id: "short_1x1", label: "Square", ratio: "1:1", note: "Feed posts" },
  { id: "youtube_16x9", label: "Wide", ratio: "16:9", note: "YouTube, websites" },
] as const;

/**
 * Lengths, with what each does to the pacing said out loud.
 *
 * The number that matters is seconds per photo, not the total: twelve photos
 * in twelve seconds is a rhythm montage where the Ken Burns move is invisible,
 * and the same twelve over a minute is a slow tour. Someone picking "12s"
 * because it sounds punchy should be able to see which of those they are
 * choosing before they wait for the render.
 */
const LENGTHS = [7, 12, 30, 60] as const;

type Voice = "music" | "script" | "record";

export function PhotoReelForm({
  city: initialCity,
  state: initialState,
  /**
   * Photos already gathered on the Listing video tab, so a Zillow import does
   * not have to be re-uploaded by hand to make a reel of the same house.
   *
   * They arrive as bare URLs; the reel's own photos carry a name and a caption
   * too, so they seed with an empty caption and a positional name. Read once,
   * on mount: this component unmounts when the tab switches, so switching to
   * the reel is always a fresh mount and there is no half-edited state to
   * overwrite.
   */
  initialPhotos,
  initialAddress,
}: {
  city?: string;
  state?: string;
  initialPhotos?: string[];
  initialAddress?: string;
}) {
  /** Each photo carries its own optional line of on-screen text. */
  const [photos, setPhotos] = useState<{ url: string; name: string; caption: string }[]>(
    () => (initialPhotos ?? [])
      .filter((u) => typeof u === "string" && u.startsWith("http"))
      .slice(0, MAX_PHOTOS)
      .map((url, i) => ({ url, name: `Listing photo ${i + 1}`, caption: "" })),
  );
  const [uploading, setUploading] = useState(false);
  /**
   * The market for THIS reel.
   *
   * These used to be read-only props holding whatever was loaded from the
   * profile, because the listing tab has no market field — so the closing
   * card named the agent's office town on a reel about a house somewhere
   * else, and the help text below told the user to "set the market above",
   * where there was nothing to set. Seeded from the props, editable here.
   */
  const [city, setCity] = useState(initialCity ?? "");
  const [state, setState] = useState(initialState ?? "");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<string>("reel_9x16");
  const [seconds, setSeconds] = useState<number>(30);
  const [voice, setVoice] = useState<Voice>("music");
  const [script, setScript] = useState("");
  const [musicId, setMusicId] = useState("inspiring");
  /**
   * On by default wherever there is speech, and impossible where there isn't.
   *
   * Most of these are watched on a phone with the sound off, so captions are
   * closer to required than optional — but they are burned into the picture and
   * cannot be taken out afterwards, which is exactly why it is a switch rather
   * than an assumption.
   */
  const [captions, setCaptions] = useState(true);
  /** The ask, held over the last few seconds once the photos have done their work. */
  const [endCard, setEndCard] = useState(true);
  const [endCardHeadline, setEndCardHeadline] = useState("See it in person");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // ── Voiceover recording ──────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recordedSecs, setRecordedSecs] = useState(0);
  const [voiceoverPath, setVoiceoverPath] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    micRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  /**
   * Uploads a batch of photos without racing the auth lock.
   *
   * Every file used to check the upload gate and resolve the signed-in user
   * for itself, and all of them ran at once — so ten photos meant ten
   * identical gate requests and ten contenders for the Web Lock that guards
   * the Supabase auth token, which is what produced `Lock "lock:sb-…-auth-
   * token" was released because another request stole it` on a phone.
   *
   * The gate and the user are settled once, up front. Uploads then run three
   * at a time: enough to be quick, few enough that a phone's connection is not
   * carrying twelve at once.
   *
   * allSettled, not all — Promise.all rejects on the first failure and
   * discards the successes with it, which is why a single bad photo emptied
   * the whole list back to 0/12.
   */
  async function addPhotos(files: FileList) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    setUploading(true);
    setError(null);
    try {
      await assertPhotoUploadAllowed();
      const userId = await currentUserId();

      const queue = Array.from(files).slice(0, room);
      const done: { url: string; name: string; caption: string }[] = [];
      const failures: string[] = [];

      const BATCH = 3;
      for (let i = 0; i < queue.length; i += BATCH) {
        const results = await Promise.allSettled(
          queue.slice(i, i + BATCH).map((f) => uploadVideoPhoto(f, userId)),
        );
        results.forEach((r, j) => {
          if (r.status === "fulfilled") {
            done.push({ url: r.value.url, name: r.value.name, caption: "" });
          } else {
            const file = queue[i + j];
            failures.push(r.reason instanceof Error ? r.reason.message : `"${file.name}" failed`);
          }
        });
        // Shown as they land, so a slow batch does not look like a stall.
        if (done.length) setPhotos((prev) => {
          const merged = [...prev];
          for (const d of done.splice(0)) {
            if (merged.length < MAX_PHOTOS) merged.push(d);
          }
          return merged;
        });
      }

      if (failures.length) {
        setError(
          failures.length === 1
            ? failures[0]
            : `${failures.length} photos didn't upload. ${failures[0]}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micRef.current = mic;
      chunksRef.current = [];
      const rec = new MediaRecorder(mic);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        micRef.current?.getTracks().forEach((t) => t.stop());
        micRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        try {
          // Straight to storage on a signed URL, the same way a camera take
          // goes — the render reads it back server-side, so it never has to
          // fit through a request body.
          const res = await fetch("/api/video/camera-upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ext: "webm" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Could not prepare the upload");
          const supabase = createClient();
          const { error: upErr } = await supabase.storage
            .from("assets")
            .uploadToSignedUrl(data.path, data.token, blob, { contentType: "audio/webm" });
          if (upErr) throw new Error(upErr.message);
          setVoiceoverPath(data.path as string);
          toast.success("Voiceover saved. It sets the length of the reel.");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not save that recording");
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecordedSecs(0);
      timerRef.current = setInterval(() => setRecordedSecs((s) => s + 1), 1000);
    } catch {
      setError("Microphone access is needed to record a voiceover.");
    }
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  const musicQuery = MUSIC_PRESETS.find((m) => m.id === musicId)?.query ?? null;
  const scriptWords = script.trim() ? script.trim().split(/\s+/).length : 0;
  // A script's length decides the reel's length, not the picker — so the
  // picker is hidden on that route rather than left there lying.
  const effectiveSecs = voice === "script"
    ? Math.max(5, Math.round((scriptWords / WPM) * 60))
    : voice === "record"
      ? recordedSecs
      : seconds;
  const perPhoto = photos.length ? effectiveSecs / photos.length : 0;
  const ready = photos.length > 0 && !rendering &&
    (voice !== "script" || scriptWords >= 8) &&
    (voice !== "record" || !!voiceoverPath);

  async function render() {
    setRendering(true);
    setError(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/video/photo-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrls: photos.map((p) => p.url),
          photoCaptions: photos.map((p) => p.caption),
          title: title.trim() || "Photo Reel",
          format,
          seconds,
          script: voice === "script" ? script.trim() : undefined,
          voiceoverPath: voice === "record" ? voiceoverPath : undefined,
          musicQuery,
          captions: voice !== "music" && captions,
          endCard,
          endCardHeadline,
          address,
          city,
          state,
        }),
      });
      /**
       * A timeout does not answer in JSON.
       *
       * When the render runs past the function's limit the platform replies
       * with its own plain-text page, and res.json() threw on the first
       * character of it — so the user was shown "Unexpected token 'A', "An
       * error o"... is not valid JSON" instead of what happened. A 504 has a
       * real explanation and an obvious next step, and both belong on screen.
       */
      const raw = await res.text();
      let data: { videoId?: string; error?: string } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* not JSON — handled below */ }

      if (!res.ok) {
        const timedOut = res.status === 504 || /timed out/i.test(raw);
        throw new Error(
          data.error
            || (timedOut
              ? "That reel took too long to build. Try fewer photos, or a shorter length — a 60-second reel with twelve photos is the slowest thing here."
              : `Could not build that reel (error ${res.status}).`),
        );
      }
      setSavedId(data.videoId as string);
      toast.success("Reel is ready. It's in My Videos.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build that reel");
    } finally {
      setRendering(false);
    }
  }

  /** Swap a photo with its neighbour. Captions travel with their picture —
   *  they are a property of the photo, not of the slot it sits in. */
  function movePhoto(from: number, to: number) {
    if (to < 0 || to >= photos.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12.5px] leading-[1.45] text-amber-900">{error}</p>
        </div>
      )}

      {/* ── Photos ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">
          Photos <span className="font-normal text-spark-ink-faint">· up to {MAX_PHOTOS}, in this order</span>
        </p>
        {/* A row per photo rather than a grid of thumbnails, because each one
            now carries a line of text and a caption needs to sit beside the
            picture it labels — a caption under a grid is a guessing game. */}
        {photos.length > 0 && (
          <div className="mb-2 flex flex-col gap-1.5">
            {photos.map((p, i) => (
              <div key={p.url} className="flex items-center gap-2">
                <span className="w-4 shrink-0 text-[11px] tabular-nums text-spark-ink-faint">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} className="h-12 w-12 shrink-0 rounded-lg border border-spark-rule object-cover" />
                <input
                  value={p.caption}
                  onChange={(e) => {
                    const caption = e.target.value;
                    setPhotos((prev) => prev.map((q, j) => (j === i ? { ...q, caption } : q)));
                  }}
                  placeholder={i === 0 ? "Text on this photo, e.g. BEFORE · Kitchen" : "Optional text"}
                  maxLength={80}
                  className="min-w-0 flex-1 rounded-lg border border-spark-rule px-2.5 py-1.5 text-[12.5px] text-spark-ink outline-none focus:border-spark-amber"
                />
                {/* Reorder. The header has always said "in this order" and
                    the order has always been whatever order the files came
                    off the picker in — the one thing the caption rows made
                    legible was the one thing you could not change.

                    Arrows rather than drag: the row holds a text input, and
                    making it draggable takes away click-and-drag selection
                    inside that input. Arrows also work on a phone, which
                    HTML5 drag does not. */}
                {/* Sized for a thumb. These were 13px icons with 2px of
                    padding — a target under 20px square, which is fine with a
                    mouse and close to unhittable on a phone, where most of
                    these reels are actually made. The icons grow a little and
                    the tappable area a lot. */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => movePhoto(i, i - 1)}
                    disabled={i === 0}
                    className="flex h-8 w-9 items-center justify-center rounded-lg border border-spark-rule bg-white text-spark-ink-muted disabled:opacity-25 enabled:active:bg-spark-amber-tint enabled:hover:border-spark-amber enabled:hover:text-spark-amber"
                    aria-label={`Move photo ${i + 1} earlier`}
                  >
                    <ChevronUp size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(i, i + 1)}
                    disabled={i === photos.length - 1}
                    className="flex h-8 w-9 items-center justify-center rounded-lg border border-spark-rule bg-white text-spark-ink-muted disabled:opacity-25 enabled:active:bg-spark-amber-tint enabled:hover:border-spark-amber enabled:hover:text-spark-amber"
                    aria-label={`Move photo ${i + 1} later`}
                  >
                    <ChevronDown size={17} />
                  </button>
                </div>
                {/* Set apart from the arrows, and a real target of its own.
                    Enlarging the arrows put a 44px control immediately beside
                    an 18px one, so reaching for delete hit "move later"
                    instead — a miss that changes the video rather than doing
                    nothing. */}
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-spark-ink text-white active:bg-red-600"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
              Arrows reorder — photo 1 opens the reel. Text appears on a card at the top while that
              photo is up, and only on the photos you write one for. Leave them all blank for a reel
              with no labels.
            </p>
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-spark-rule px-4 py-5 text-center hover:border-spark-rule-dim">
            {uploading
              ? <Loader2 size={18} className="animate-spin text-spark-amber" />
              : <Upload size={18} className="text-spark-ink-faint" />}
            <span className="text-[12.5px] font-semibold text-spark-ink-soft">
              {uploading ? "Uploading…" : `Add photos (${photos.length}/${MAX_PHOTOS})`}
            </span>
            <span className="text-[11px] text-spark-ink-faint">JPG, PNG or WEBP · max 25 MB each</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={uploading}
              onChange={(e) => { if (e.target.files?.length) addPhotos(e.target.files); }}
            />
          </label>
        )}
      </div>

      {/* Said plainly because it is two things at once, and the on-screen half
          is the surprising one: left blank it is not merely untitled, it puts
          the words "Photo Reel" across the opening of your video. */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-spark-ink-muted">
          Title <span className="font-normal text-spark-ink-faint">
            · shown on screen for the first 4 seconds, and names the video in My Videos
          </span>
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="24 Shagbark Court, just listed"
          maxLength={120}
          className="rounded-lg border border-spark-rule px-2.5 py-1.5 text-[13px] text-spark-ink outline-none focus:border-spark-amber"
        />
        {!title.trim() && (
          <span className="text-[11px] text-spark-ink-faint">
            Leave it empty and the reel opens with &ldquo;Photo Reel&rdquo; written across it.
          </span>
        )}
      </label>

      {/* ── Shape ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">Shape</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                format === f.id
                  ? "border-spark-amber bg-spark-amber-tint"
                  : "border-spark-rule bg-white hover:border-spark-rule-dim"
              }`}
            >
              <span className="block text-[12px] font-bold text-spark-ink">{f.label} · {f.ratio}</span>
              <span className="block text-[10.5px] text-spark-ink-faint">{f.note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Voice ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">Sound</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { id: "music", label: "Music only", note: "No talking" },
            { id: "script", label: "Write a script", note: "Read in your voice" },
            { id: "record", label: "Record my voice", note: "Say it yourself" },
          ] as const).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVoice(v.id)}
              aria-pressed={voice === v.id}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                voice === v.id
                  ? "border-spark-amber bg-spark-amber-tint"
                  : "border-spark-rule bg-white hover:border-spark-rule-dim"
              }`}
            >
              <span className="block text-[12px] font-bold text-spark-ink">{v.label}</span>
              <span className="block text-[10.5px] text-spark-ink-faint">{v.note}</span>
            </button>
          ))}
        </div>
      </div>

      {voice === "script" && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-spark-ink-faint">
            Read in your cloned voice. The script&rsquo;s length sets the reel&rsquo;s length.
          </span>
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={4}
            placeholder="Just listed in Blue Bell. Four bedrooms, a kitchen taken back to the studs last year, and a garden that catches the afternoon sun."
            className="resize-y rounded-lg border border-spark-rule px-2.5 py-2 text-[13px] leading-[1.5] text-spark-ink outline-none focus:border-spark-amber"
          />
          <span className="text-[11px] text-spark-ink-faint">
            {scriptWords} words ≈ {effectiveSecs}s spoken
          </span>
        </label>
      )}

      {voice === "record" && (
        <div className="flex items-center gap-2 rounded-lg border border-spark-rule px-2.5 py-2">
          <Button
            type="button"
            size="sm"
            variant={recording ? "outline" : "primary"}
            onClick={recording ? stopRecording : startRecording}
            className="gap-1.5"
          >
            {recording ? <Square size={13} /> : <Mic size={13} />}
            {recording ? "Stop" : voiceoverPath ? "Record again" : "Record"}
          </Button>
          <span className="text-[12px] text-spark-ink-muted">
            {recording
              ? `Recording ${recordedSecs}s`
              : voiceoverPath
                ? `Saved · ${recordedSecs}s, and that is how long the reel will be.`
                : "Speak over the photos in your own voice."}
          </span>
        </div>
      )}

      {/* Only where there are words to caption. On the music-only route there
          is nothing being said, so the control would be a switch with nothing
          on the other end of it. */}
      {voice !== "music" && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-spark-rule px-2.5 py-2">
          <input
            type="checkbox"
            checked={captions}
            onChange={(e) => setCaptions(e.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 accent-spark-amber"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-spark-ink">Burn in captions</span>
            <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">
              {voice === "script"
                ? "Taken from your script, so every word is spelled the way you wrote it."
                : "Transcribed from your recording, which adds a few seconds and can mishear a street name."}
              {" "}They cannot be removed afterwards.
            </span>
          </span>
        </label>
      )}

      {/* Length is only a choice when nothing is being said over the top. */}
      {voice === "music" && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">Length</p>
          <div className="flex flex-wrap gap-1.5">
            {LENGTHS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeconds(s)}
                aria-pressed={seconds === s}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  seconds === s
                    ? "border-spark-amber bg-spark-amber-tint text-spark-ink"
                    : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
                }`}
              >
                {s}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Market ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">
          Market for this reel <span className="font-normal text-spark-ink-faint">· names the town on the closing card</span>
        </p>
        <div className="flex gap-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City"
            className="min-w-0 flex-1 rounded-lg border border-spark-rule px-2.5 py-1.5 text-[12.5px] text-spark-ink outline-none focus:border-spark-amber"
          />
          <input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            placeholder="ST"
            maxLength={2}
            className="w-14 shrink-0 rounded-lg border border-spark-rule px-2.5 py-1.5 text-[12.5px] uppercase text-spark-ink outline-none focus:border-spark-amber"
          />
        </div>
        <p className="mt-1 text-[11px] leading-[1.45] text-spark-ink-faint">
          Set it to the property&apos;s town, not your office.
        </p>
      </div>

      {/* ── Closing card ── */}
      {/* The phone comes from your profile and the town from the market above,
          so the only thing asked for here is the wording of the ask itself. */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-spark-rule px-2.5 py-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={endCard}
            onChange={(e) => setEndCard(e.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 accent-spark-amber"
          />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-spark-ink">Closing card</span>
            <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">
              Dims the last few seconds and shows the ask, the property and your phone number.
            </span>
          </span>
        </label>
        {endCard && (
          <div className="flex flex-col gap-1.5 pl-5.5">
            <input
              value={endCardHeadline}
              onChange={(e) => setEndCardHeadline(e.target.value)}
              placeholder="See it in person"
              maxLength={60}
              className="rounded-lg border border-spark-rule px-2.5 py-1.5 text-[12.5px] text-spark-ink outline-none focus:border-spark-amber"
            />
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="24 Shagbark Ct E (optional)"
              maxLength={80}
              className="rounded-lg border border-spark-rule px-2.5 py-1.5 text-[12.5px] text-spark-ink outline-none focus:border-spark-amber"
            />
            <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
              {city || state
                ? <>Followed by {[city, state].filter(Boolean).join(", ")} and your phone number from Settings.</>
                : <>Followed by your phone number from Settings. Fill in the market above to name the town too.</>}
            </p>
          </div>
        )}
      </div>

      {/* ── Music ── */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-spark-ink-muted">Music</p>
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

      {/* The number that actually decides how this looks. Shown before the
          render, because the render is the slow part and "2.5 seconds each" is
          the difference between a tour and a montage. */}
      {photos.length > 0 && effectiveSecs > 0 && (
        <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
          {photos.length} photos over {effectiveSecs}s. About{" "}
          <strong className="font-semibold text-spark-ink-soft">{perPhoto.toFixed(1)}s each</strong>.{" "}
          {perPhoto < 1.4
            ? "A fast montage; the slow zoom won't read at that speed."
            : perPhoto > 6
              ? "A long hold on each shot. Consider more photos or a shorter reel."
              : "A comfortable pace for a property tour."}
        </p>
      )}

      <Button onClick={render} size="lg" disabled={!ready} className="gap-2">
        {rendering ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
        {rendering ? "Building your reel…" : "Build the reel"}
      </Button>

      {rendering && (
        <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
          Rendering on our server, so you can leave this page. Most reels take three to five
          minutes — the longer ones, and the ones with more photos, take the longer end of that.
        </p>
      )}

      {savedId && (
        <div className="flex items-center gap-2 rounded-lg border border-spark-rule px-3 py-2.5">
          <p className="flex-1 text-[13px] font-semibold text-spark-ink">Saved to My Videos</p>
          <a href={`/videos?highlight=${savedId}`}>
            <Button variant="outline" size="lg">View it</Button>
          </a>
        </div>
      )}
    </div>
  );
}
