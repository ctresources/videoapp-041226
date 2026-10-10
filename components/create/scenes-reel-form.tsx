"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Film, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { WPM } from "@/lib/utils/video-length";

/** The longest a Scenes reel runs, and what that is in words at reading pace. */
const MAX_SECONDS = 90;
const MAX_WORDS = Math.floor((MAX_SECONDS / 60) * WPM);
/**
 * The lengths the writer can be asked for, each comfortably inside its time.
 * Thirty seconds is the one most reels and shorts want; ninety is the limit.
 */
const LENGTHS = [
  { seconds: 30, words: 65, note: "Reels, Shorts" },
  { seconds: 60, words: 130, note: "One idea, in full" },
  { seconds: 90, words: 195, note: "The longest" },
] as const;

const SHAPES = [
  // Vertical and Horizontal, as everywhere else. "Reel" named a shape here
  // and a kind of video one card over, and was heard as either.
  { key: "reel_9x16", label: "Vertical 9:16", note: "Reels, Shorts, TikTok" },
  { key: "youtube_16x9", label: "Horizontal 16:9", note: "YouTube, websites" },
  { key: "short_1x1", label: "Square 1:1", note: "Feeds" },
] as const;

/**
 * A reel with no photos: your voice over scenes made from the script.
 *
 * The Photos only reel beside this needs pictures, and a topic has none. This
 * takes a topic, or a script you already have, reads it in your voice clone
 * and makes the picture for each part of it. Built by the same route and the
 * same renderer as the photo reel, so captions, music and the closing card
 * are the ones that reel has.
 *
 * It is a short thing on purpose. The whole reel is made in one request, and
 * ninety seconds of it is what fits; a longer script is an avatar video.
 *
 * It says plainly what the pictures are. They are generated and generic, any
 * people in them are seen from behind or at a distance, they are never of the
 * town or a property, and the reel is labelled AI-made when it is published.
 *
 * It has its own card on the Create page now, and takes its topic from the
 * Topic box at the top of that page, the same box the mic writes into. With
 * no `topic` passed it keeps a topic field of its own.
 */
export function ScenesReelForm({ city: initialCity, state: initialState, topic: topicFromPage, writeSignal, onWriting, vertical = true }: {
  city?: string;
  state?: string;
  /** The page's topic. When given, this is the topic and there is no field here. */
  topic?: string;
  /** Changes when the page wants the script written now: the mic said to make this. */
  writeSignal?: number;
  /** Tells the page while a script is being written, so the mic waits for it. */
  onWriting?: (busy: boolean) => void;
  /** The format chosen on the page. Vertical is a minute; horizontal runs the full ninety seconds. */
  vertical?: boolean;
}) {
  const [ownTopic, setTopic] = useState("");
  const topic = topicFromPage ?? ownTopic;
  const [lengthSeconds, setLengthSeconds] = useState<number>(vertical ? 60 : 90);
  const [script, setScript] = useState("");
  const [writing, setWriting] = useState(false);
  const [city, setCity] = useState(initialCity ?? "");
  const [state, setState] = useState(initialState ?? "");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<string>(vertical ? "reel_9x16" : "youtube_16x9");
  const [musicId, setMusicId] = useState("inspiring");
  const [captions, setCaptions] = useState(true);
  const [endCard, setEndCard] = useState(true);
  const [endCardHeadline, setEndCardHeadline] = useState("Let's talk about your move");
  /** null until the profile has been read. */
  const [hasVoiceClone, setHasVoiceClone] = useState<boolean | null>(null);
  const [rendering, setRendering] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [openingVideo, setOpeningVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("voice_clone_id, heygen_voice_id, voice_sample_url")
        .eq("id", user.id)
        .single();
      const v = data as { voice_clone_id?: string | null; heygen_voice_id?: string | null; voice_sample_url?: string | null } | null;
      if (!cancelled) setHasVoiceClone(!!(v?.heygen_voice_id || v?.voice_sample_url || v?.voice_clone_id));
    })();
    return () => { cancelled = true; };
  }, []);

  // The market can be said to the mic after this is on screen.
  useEffect(() => { if (initialCity) setCity(initialCity); }, [initialCity]);
  useEffect(() => { if (initialState) setState(initialState); }, [initialState]);

  const words = script.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.round((words / WPM) * 60);
  const tooLong = words > MAX_WORDS;
  const ready = words >= 8 && !tooLong && !rendering && !writing;
  const musicQuery = MUSIC_PRESETS.find((m) => m.id === musicId)?.query ?? null;

  /** A script written from the topic, at a length that fits. Free: nothing is made yet. */
  async function writeScript() {
    if (!topic.trim() || writing) { onWriting?.(false); return; }
    setWriting(true);
    onWriting?.(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate-camera-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          targetWords: LENGTHS.find((l) => l.seconds === lengthSeconds)?.words ?? 130,
          city,
          state,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.script) throw new Error((data?.error as string) || "Could not write that script");
      setScript(String(data.script).trim());
      if (!title.trim()) setTitle(topic.trim().slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write that script");
    } finally {
      setWriting(false);
      onWriting?.(false);
    }
  }

  // The mic said to make a Scenes Reel: write it, as pressing the button would.
  useEffect(() => {
    if (!writeSignal) return;
    void writeScript();
    // Only when the page signals; the words are read as they are then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeSignal]);

  async function render() {
    setRendering(true);
    setError(null);
    setSavedId(null);
    try {
      const res = await fetch("/api/video/photo-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: true,
          title: title.trim() || topic.trim().slice(0, 100) || "Scenes Reel",
          format,
          script: script.trim(),
          musicQuery,
          captions,
          endCard,
          endCardHeadline,
          city,
          state,
        }),
      });
      // A timeout does not answer in JSON; see the photo reel form.
      const raw = await res.text();
      let data: {
        videoId?: string;
        error?: string;
        voice?: "yours" | "stock";
        scenes?: { made: number; asked: number; charged: boolean };
      } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* not JSON, handled below */ }

      if (!res.ok) {
        const timedOut = res.status === 504 || /timed out/i.test(raw);
        throw new Error(
          data.error
            || (timedOut
              ? "That reel took too long to build, so nothing was taken from your plan. Try a shorter script."
              : `Could not build that reel (error ${res.status}).`),
        );
      }
      setSavedId(data.videoId as string);
      const s = data.scenes;
      toast.success(
        s && s.made < s.asked
          ? `Scenes reel is ready, with ${s.made} of ${s.asked} scenes. It's in My Sparks.`
          : "Scenes reel is ready. It's in My Sparks.",
        { duration: 7000 },
      );
      if (data.voice === "stock" && hasVoiceClone) {
        toast("Your voice clone couldn't be used this time, so a stock voice read the script.", { duration: 8000, icon: "🎙️" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build that reel");
    } finally {
      setRendering(false);
    }
  }

  const field = "rounded-lg border border-spark-rule px-2.5 py-2 text-[14px] text-spark-ink outline-none focus:border-spark-amber";
  const label = "mb-1.5 text-[11px] font-semibold text-spark-ink-muted";

  return (
    <div className="flex flex-col gap-3.5">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-[12.5px] leading-[1.45] text-amber-900">{error}</p>
        </div>
      )}

      {/* ── Topic ── */}
      <div>
        <p className={label}>
          Topic{" "}
          <span className="font-normal text-spark-ink-faint">
            {topicFromPage !== undefined
              ? "· from the Topic box at the top of the page. Or skip this and write your own script below"
              : "· we write the script from it, or skip this and write your own below"}
          </span>
        </p>
        <div className="flex gap-2">
          {topicFromPage !== undefined ? (
            // Shown, not asked for again: the page already has one topic box.
            <p className={`min-w-0 flex-1 truncate border-dashed ${field} ${topic.trim() ? "" : "text-spark-ink-faint"}`}>
              {topic.trim() || "Say or type a topic in the box at the top"}
            </p>
          ) : (
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void writeScript(); } }}
              placeholder="Three things to fix before listing this fall"
              maxLength={200}
              className={`min-w-0 flex-1 ${field}`}
            />
          )}
          <Button type="button" variant="outline" onClick={() => void writeScript()} loading={writing} disabled={!topic.trim()} className="gap-1.5">
            {!writing && <Sparkles size={14} />}
            {writing ? "Writing…" : script.trim() ? "Rewrite" : "Write it"}
          </Button>
        </div>
      </div>

      {/* ── Length ── */}
      <div>
        <p className={label}>Length <span className="font-normal text-spark-ink-faint">· how long a script to write</span></p>
        <div className="grid grid-cols-3 gap-1.5">
          {LENGTHS.map((l) => (
            <button
              key={l.seconds}
              type="button"
              onClick={() => setLengthSeconds(l.seconds)}
              aria-pressed={lengthSeconds === l.seconds}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                lengthSeconds === l.seconds ? "border-spark-amber bg-spark-amber-tint" : "border-spark-rule bg-white hover:border-spark-rule-dim"
              }`}
            >
              <span className="block text-[12px] font-bold text-spark-ink">{l.seconds} seconds</span>
              <span className="block text-[10.5px] text-spark-ink-faint">{l.note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Script ── */}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-spark-ink-faint">
          <span className="font-semibold text-spark-ink-muted">Script</span>{" · "}
          {hasVoiceClone === false ? (
            <>
              read by a stock voice, because you haven&rsquo;t set up your voice clone yet.{" "}
              <a href="/settings#voice" className="font-semibold text-spark-amber underline">Set it up</a>{" "}
              to hear yourself.
            </>
          ) : hasVoiceClone ? "read in your voice clone." : "read aloud for you."}{" "}
          Its length sets the reel&rsquo;s length.
        </span>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={6}
          placeholder="What you want said, in your own words. A few sentences is enough."
          className={`resize-y leading-[1.5] ${field}`}
        />
        <span className={`text-[11.5px] ${tooLong ? "font-semibold text-amber-800" : "text-spark-ink-faint"}`}>
          {words} words, about {seconds} seconds.{" "}
          {tooLong
            ? `A Scenes reel runs up to ${MAX_SECONDS} seconds, which is about ${MAX_WORDS} words. Trim ${words - MAX_WORDS}.`
            : `Up to ${MAX_SECONDS} seconds (about ${MAX_WORDS} words).`}
        </span>
      </label>

      {/* ── Title ── */}
      <div>
        <p className={label}>Title <span className="font-normal text-spark-ink-faint">· shown at the start, and used when you publish</span></p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Getting your home ready to sell" maxLength={120} className={`w-full ${field}`} />
      </div>

      {/* ── Shape ── */}
      <div>
        <p className={label}>Shape</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setFormat(s.key)}
              aria-pressed={format === s.key}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                format === s.key ? "border-spark-amber bg-spark-amber-tint" : "border-spark-rule bg-white hover:border-spark-rule-dim"
              }`}
            >
              <span className="block text-[12px] font-bold text-spark-ink">{s.label}</span>
              <span className="block text-[10.5px] text-spark-ink-faint">{s.note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Market ── */}
      <div>
        <p className={label}>Market <span className="font-normal text-spark-ink-faint">· names the town in the script and on the closing card</span></p>
        <div className="flex gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={`min-w-0 flex-1 ${field}`} />
          <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="ST" maxLength={2} className={`w-16 shrink-0 uppercase ${field}`} />
        </div>
      </div>

      {/* ── Captions and closing card ── */}
      <div className="flex flex-col gap-2 rounded-lg border border-spark-rule px-2.5 py-2">
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-spark-amber" />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-spark-ink">Captions</span>
            <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">The spoken words on screen. Most reels are watched with the sound off.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2">
          <input type="checkbox" checked={endCard} onChange={(e) => setEndCard(e.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-spark-amber" />
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold text-spark-ink">Closing card</span>
            <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">Your ask, the town and your phone number over the last few seconds.</span>
          </span>
        </label>
        {endCard && (
          <input
            value={endCardHeadline}
            onChange={(e) => setEndCardHeadline(e.target.value)}
            placeholder="Let's talk about your move"
            maxLength={60}
            className={`ml-5.5 ${field}`}
          />
        )}
      </div>

      {/* ── Music ── */}
      <div>
        <p className={label}>Music</p>
        <div className="flex flex-wrap gap-1.5">
          {MUSIC_PRESETS.filter((m) => m.id !== "custom").map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMusicId(m.id)}
              aria-pressed={musicId === m.id}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                musicId === m.id ? "border-spark-amber bg-spark-amber-tint text-spark-ink" : "border-spark-rule bg-white text-spark-ink-muted hover:border-spark-rule-dim"
              }`}
            >
              {m.emoji} {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Said before the button, because it is what they are agreeing to. */}
      <p className="rounded-lg bg-[#f4f2e8] px-3 py-2 text-[11.5px] leading-[1.5] text-spark-ink-soft">
        The pictures are <strong className="font-semibold">made with AI</strong>, one for each sentence of your script,
        showing what that sentence is about. Any people are seen from behind or at a distance. They are not
        your town and not a real property, and{" "}
        <strong className="font-semibold">&ldquo;Scenes made with AI.&rdquo;</strong> is added to the description.
        Uses <strong className="font-semibold">one short video</strong> from your plan, taken only once the reel is made.
      </p>

      {savedId ? (
        <div className="space-y-2">
          <p className="text-center text-[13px] font-semibold text-spark-ink">Saved to My Sparks</p>
          <a href={`/videos?highlight=${savedId}`} onClick={() => setOpeningVideo(true)} className="block">
            <Button size="lg" className="w-full gap-2">
              {openingVideo ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
              {openingVideo ? "Opening…" : "View your reel"}
            </Button>
          </a>
          <button
            type="button"
            onClick={() => setSavedId(null)}
            className="block w-full text-center text-[12.5px] font-medium text-spark-amber hover:text-spark-blue"
          >
            Make another reel (uses another short video)
          </button>
        </div>
      ) : (
        <Button onClick={render} size="lg" disabled={!ready} className="gap-2">
          {rendering ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
          {rendering ? "Building your reel…" : "Build the Scenes reel"}
        </Button>
      )}

      {rendering && (
        <p className="text-[11px] leading-[1.45] text-spark-ink-faint">
          Reading the script in your voice, making the scenes, then putting the reel together. This takes
          two to five minutes, longer for a longer reel; keep this page open until it finishes.
        </p>
      )}
    </div>
  );
}
