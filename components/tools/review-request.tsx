"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Camera, CircleUser, Film, ImagePlus, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmailResult } from "@/components/email/email-result";
import { BoldTrailPeople, BT_MAX, type BtContact } from "@/components/email/boldtrail-send";
import { greetingName, reviewRequestAsHtml, reviewRequestAsText } from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";
import { uploadVideoPhoto } from "@/lib/utils/upload-photo";
import { MUSIC_PRESETS } from "@/lib/utils/music-presets";
import { WPM } from "@/lib/utils/video-length";
import { showTrialLock } from "@/lib/utils/trial-lock";
import { LookPicker } from "@/components/halo/halo-sites-card";

/**
 * Ask for Google Review Video Email (2026-10-27, the owner's mockup): a short
 * video asking past clients for a review, emailed with a big gold button to
 * the agent's Google review page. Like Seller Update: who → video → email →
 * send. Through BoldTrail when it's connected, otherwise SparkReels sends it
 * as "<Agent> via SparkReels" with replies to the agent.
 */

type Person = { id?: string; name: string; email: string };
type Vid = { id: string; url: string; seconds?: number | null; title?: string; thumbnail?: string | null; createdAt?: string };
type Way = "record" | "avatar" | "reel" | "mine";

const MAX_AVATAR_WORDS = Math.floor((60 * WPM) / 60);
const RETURN_KEY = "review-request-return";
const DEFAULT_SCRIPT = "Hi! It was such a pleasure helping you with your move. If you have a minute, would you leave me a quick Google review? The link is right below this video. It really helps other families find me. Thank you!";
const DEFAULT_SUBJECT = "Would you leave me a quick review?";
/**
 * The email's note says what the video says (2026-10-29, the owner's ask):
 * "Hi {first name}," and then the video's own words, with its opening hello
 * taken off (the greeting already says it).
 */
function noteFromScript(script: string): string {
  const body = script.trim().replace(/^(hi|hello|hey)\b[^.!?,]*[.!?,]\s*/i, "").trim();
  return `Hi {first name},\n\n${body}`;
}
const DEFAULT_NOTE = noteFromScript(DEFAULT_SCRIPT);

const eyebrow = "mb-1 text-[11.5px] font-bold uppercase tracking-[0.12em] text-spark-ink";
const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";
const wordsOf = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-t border-spark-rule py-4 first:border-t-0 first:pt-0">
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-spark-amber text-[13px] font-bold text-white">{n}</span>
      <div className="min-w-0 flex-1"><p className="mb-2 text-[15px] font-semibold text-spark-ink">{title}</p>{children}</div>
    </div>
  );
}

export function ReviewRequestTool() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [boldtrail, setBoldtrail] = useState(false);
  const [picks, setPicks] = useState<BtContact[]>([]);
  const [signature, setSignature] = useState<EmailSignature>({});
  const [videos, setVideos] = useState<Vid[]>([]);

  const [people, setPeople] = useState<Person[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [way, setWay] = useState<Way | null>(null);
  const [video, setVideo] = useState<Vid | null>(null);
  const [making, setMaking] = useState(false);
  const [avatarProject, setAvatarProject] = useState<string | null>(null);
  /** The photo or avatar for Avatar in circle (2026-10-29). Null = the headshot. */
  type LookItem = { id: string; name: string; preview_image_url: string | null; status: string | null; shape?: "landscape" | "portrait" | "square" | null };
  const [looks, setLooks] = useState<LookItem[]>([]);
  const [twinLookId, setTwinLookId] = useState<string | null>(null);
  const [twinLookIds, setTwinLookIds] = useState<string[]>([]);
  const [lookId, setLookId] = useState<string | null>(null);
  useEffect(() => {
    if (way !== "avatar" || looks.length) return;
    fetch("/api/avatar/looks").then((r) => (r.ok ? r.json() : null)).then((b) => {
      if (!b) return;
      const ids: string[] = Array.isArray(b.twinLookIds) ? b.twinLookIds : [];
      const ready = ((b.looks ?? []) as LookItem[]).filter((l) => !l.status || l.status === "completed" || l.status === "active");
      setLooks([...ready.filter((l) => ids.includes(l.id)), ...ready.filter((l) => !ids.includes(l.id))]);
      setTwinLookIds(ids);
      setTwinLookId(typeof b.twinLookId === "string" ? b.twinLookId : null);
      // Start on the headshot's widescreen copy (this video is horizontal),
      // so the circle shown picked is the one that's made.
      const wide = b.formatLooks?.wide as string | null | undefined;
      setLookId((cur) => cur ?? (wide && ready.some((l) => l.id === wide) ? wide : ready[0]?.id ?? null));
    }).catch(() => {});
  }, [way, looks.length]);

  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [voice, setVoice] = useState<"cards" | "voice">("cards");
  const [music, setMusic] = useState("bright");
  const fileRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [note, setNote] = useState(DEFAULT_NOTE);
  /** The note follows the video's words until it's typed in here (2026-10-29). */
  const [noteOwn, setNoteOwn] = useState(false);
  useEffect(() => { if (!noteOwn) setNote(noteFromScript(script)); }, [script, noteOwn]);
  const [confirming, setConfirming] = useState(false);
  const [copyMe, setCopyMe] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<{ name: string; sent: boolean }[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/review-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "load" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(d?.error || "Couldn't open the tool."); setLoaded(true); return; }
      setReviewUrl(d.reviewUrl ?? null);
      setBoldtrail(!!d.boldtrail);
      setPicks(d.picks ?? []);
      setSignature(d.signature ?? {});
      const list = (d.videos ?? []) as Vid[];
      setVideos(list);
      // Back from recording it on the camera: the newest take since then.
      try {
        const since = Number(sessionStorage.getItem(RETURN_KEY) || 0);
        if (since && Date.now() - since < 3 * 3600_000) {
          const take = list.find((v) => v.createdAt && Date.parse(v.createdAt) > since);
          if (take) {
            setWay("mine"); setVideo(take); toast.success("Your recording is ready to send."); sessionStorage.removeItem(RETURN_KEY);
            // Recorded for this: a review request, like the avatar one (2026-10-29).
            void markReview(take.id);
          }
        }
      } catch { /* unavailable */ }
      setLoaded(true);
    })();
  }, []);

  // The avatar video being made: check every 15 seconds.
  useEffect(() => {
    if (!avatarProject) return;
    const t = setInterval(async () => {
      const r = await fetch("/api/review-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "video", projectId: avatarProject }) });
      const d = await r.json().catch(() => ({}));
      if (d.status === "ready" && d.video) { setVideo(d.video); setAvatarProject(null); setMaking(false); toast.success("Your avatar video is ready."); }
      if (d.status === "failed") { setAvatarProject(null); setMaking(false); toast.error("The video didn't finish, and your video was given back. Try again."); }
    }, 15000);
    return () => clearInterval(t);
  }, [avatarProject]);

  /** Marks a camera take or reel made here as a review request (2026-10-29). */
  async function markReview(videoId: string) {
    await fetch("/api/review-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark", videoId }),
    }).catch(() => {});
  }

  function recordMyself() {
    try {
      sessionStorage.setItem("camera-record-script", script);
      sessionStorage.setItem(RETURN_KEY, String(Date.now()));
    } catch { /* unavailable */ }
    router.push("/create?tab=camera");
  }

  async function makeAvatar() {
    if (wordsOf(script) > MAX_AVATAR_WORDS) { toast.error(`Keep it to about a minute: ${MAX_AVATAR_WORDS} words at most.`); return; }
    setMaking(true);
    const r = await fetch("/api/review-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "avatar", script, lookId }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMaking(false); if (showTrialLock(d)) return; toast.error(d?.error || "Couldn't start the video."); return; }
    setAvatarProject(d.projectId);
    toast.success("Making your avatar video. About 5 to 10 minutes.");
  }

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const room = 12 - photos.length;
      const picked = Array.from(files).slice(0, room);
      const up: { url: string; name: string }[] = [];
      for (const f of picked) up.push(await uploadVideoPhoto(f));
      setPhotos((p) => [...p, ...up]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function makeReel() {
    if (!photos.length) { toast.error("Add at least one photo first."); return; }
    setMaking(true);
    try {
      const sentences = script.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      const per = Math.max(1, Math.ceil(sentences.length / photos.length));
      const cards = photos.map((_, i) => sentences.slice(i * per, i * per + per).join(" ") || null);
      const preset = MUSIC_PRESETS.find((m) => m.id === music);
      const res = await fetch("/api/video/photo-reel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrls: photos.map((p) => p.url),
          title: "Google review request",
          format: "youtube_16x9",
          ...(voice === "voice" ? { script, captions: true } : { photoCaptions: cards, seconds: Math.min(60, Math.max(15, photos.length * 4)) }),
          musicQuery: preset?.query ?? null,
          endCard: true,
          endCardHeadline: "Thank you!",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { if (showTrialLock(d)) return; throw new Error(d?.error || "Couldn't make the reel."); }
      setVideo({ id: d.videoId, url: d.videoUrl, title: "Google review request" });
      if (d.videoId) void markReview(d.videoId);
      toast.success("Your photo reel is ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't make the reel.");
    } finally {
      setMaking(false);
    }
  }

  function addPerson() {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Enter their whole email address."); return; }
    if (people.length >= BT_MAX) { toast.error(`Up to ${BT_MAX} people at a time.`); return; }
    if (people.some((p) => p.email === email)) return;
    setPeople([...people, { name: newName.trim(), email }]);
    setNewName(""); setNewEmail("");
  }

  const firstName = (p?: Person) => greetingName(p?.name);
  const built = useMemo(() => {
    if (!video || !reviewUrl || !note.trim()) return null;
    const v = { url: video.url, seconds: video.seconds ?? null, posterUrl: video.thumbnail ?? null };
    return {
      html: reviewRequestAsHtml({ subject, note, firstName: firstName(people[0]), video: v, reviewUrl, signature }),
      text: reviewRequestAsText({ note, firstName: firstName(people[0]), video: v, reviewUrl, signature }),
    };
  }, [video, reviewUrl, subject, note, people, signature]);

  function startSend() {
    if (!people.length) { toast.error("Add at least one person first."); return; }
    if (!video) { toast.error("Make or pick the video first."); return; }
    if (!subject.trim() || !note.trim()) { toast.error("Add a subject and a note first."); return; }
    setConfirming(true);
  }

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/review-request/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: video?.id, subject, note, people, copyMe }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't send it.");
      const results = (d.results ?? []) as { name: string; email: string; sent: boolean }[];
      setLastSent(results.map((r) => ({ name: r.name || r.email, sent: r.sent })));
      const failed = results.filter((r) => !r.sent);
      if (failed.length) toast.error(`Not sent to ${failed.map((r) => r.name || r.email).join(", ")}.`);
      else toast.success(`Sent to ${results.length} ${results.length === 1 ? "person" : "people"}.`);
      setConfirming(false);
      setPeople([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send it.");
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-spark-amber" /></div>;

  const words = wordsOf(script);
  const choice = (w: Way, icon: React.ReactNode, title: string, sub: string) => (
    <button type="button" onClick={() => { setWay(w); if (w !== "mine") setVideo(null); }}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${way === w ? "border-spark-amber bg-spark-amber-tint" : "border-spark-rule bg-white hover:border-spark-rule-dim"}`}>
      <span className="flex items-center gap-1.5 text-[14px] font-semibold text-spark-ink">{icon}{title}</span>
      <span className="mt-0.5 block text-[12px] text-spark-ink-muted">{sub}</span>
    </button>
  );

  return (
    <div>
      <h2 className="text-lg font-bold text-spark-ink">Ask for Google Review Video Email</h2>
      <p className="mb-4 text-sm text-spark-ink-muted">A short video asking past clients for a review, with a big button to your Google review page.</p>

      {!reviewUrl && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">Add your Google review link first. It&apos;s the button in this email.</p>
          <Link href="/settings#review-link" className="rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white">Add my review link</Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-spark-rule bg-white p-4">
          <Step n={1} title="Who">
            {boldtrail ? (
              <BoldTrailPeople
                to={people.filter((p): p is BtContact => !!p.id)}
                onChange={(next) => setPeople([...next, ...people.filter((p) => !p.id)])}
                picks={picks}
                onAddPlain={(c) => { if (!people.some((x) => x.email === c.email)) setPeople([...people, c]); }}
                extra={people.filter((p) => !p.id).length}
              />
            ) : null}
            {boldtrail && people.some((p) => !p.id) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {people.filter((p) => !p.id).map((p) => (
                  <span key={p.email} className="inline-flex items-center gap-1 rounded-full border border-spark-rule bg-[#faf9f5] px-2.5 py-1 text-[13px]">
                    {p.name ? `${p.name} · ` : ""}{p.email}
                    <button type="button" aria-label="Remove" onClick={() => setPeople(people.filter((x) => x.email !== p.email || x.id))}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            {boldtrail && (
              <p className="mt-1.5 text-[12px] text-spark-ink-faint">A couple? Add each one so both can leave a review. A contact named like &ldquo;Jane &amp; Tom Smith&rdquo; is greeted &ldquo;Hi Jane and Tom,&rdquo;.</p>
            )}
            {boldtrail ? null : (
              <>
                <p className="mb-2 text-[13px] text-spark-ink-muted">Their first name and email, up to {BT_MAX}. A couple? Type both names, like Jane and Tom, with the email they share, or add each with their own email so both can leave a review.</p>
                <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                  <input className={input} placeholder="First name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <input className={input} placeholder="Email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPerson(); } }} />
                  <Button size="sm" variant="outline" onClick={addPerson}>Add</Button>
                </div>
                {people.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {people.map((p) => (
                      <span key={p.email} className="inline-flex items-center gap-1 rounded-full border border-spark-rule bg-[#faf9f5] px-2.5 py-1 text-[13px]">
                        {p.name ? `${p.name} · ` : ""}{p.email}
                        <button type="button" aria-label="Remove" onClick={() => setPeople(people.filter((x) => x.email !== p.email))}><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </Step>

          <Step n={2} title="Your video">
            <p className={eyebrow}>The words</p>
            <textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} className={`${input} resize-none`} />
            <p className={`mb-3 mt-1 text-[12px] ${way === "avatar" && words > MAX_AVATAR_WORDS ? "font-semibold text-red-600" : "text-spark-ink-faint"}`}>
              {words} words, about {Math.max(1, Math.round((words / WPM) * 60))} seconds{way === "avatar" ? ` · Avatar in circle: ${MAX_AVATAR_WORDS} words at most` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {choice("record", <Camera size={14} />, "Record it myself", "Free, unlimited")}
              {choice("avatar", <CircleUser size={14} />, "Avatar in circle", "Up to 60 sec · uses 1 short video")}
              {choice("reel", <ImagePlus size={14} />, "Photo reel", "Your photos · free")}
              {choice("mine", <Film size={14} />, "Use a video I made", "From My Sparks")}
            </div>

            {way === "record" && (
              <div className="mt-3 rounded-xl bg-[#faf9f5] p-3 text-[13px] text-spark-ink-soft">
                The camera opens with these words on the teleprompter. When it&apos;s saved, come back here: your recording is picked for you.
                <div className="mt-2"><Button size="sm" onClick={recordMyself} className="gap-1.5"><Camera size={13} /> Open the camera</Button></div>
              </div>
            )}
            {way === "avatar" && !video && (
              <div className="mt-3">
                {/* Which photo or avatar is in the circle (2026-10-29, the
                    owner's ask): every look, twins first. Nothing picked =
                    the headshot, as before. */}
                {looks.length > 0 && (
                  <div className="mb-3">
                    <p className="mb-1.5 text-[12.5px] font-semibold text-spark-ink-soft">Who&apos;s in the circle</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <LookPicker looks={looks} twinLookId={twinLookId} twinLookIds={twinLookIds} fitShape="landscape" value={lookId} onChange={setLookId} />
                    </div>
                  </div>
                )}
                <Button size="sm" onClick={() => void makeAvatar()} loading={making} disabled={words > MAX_AVATAR_WORDS}>
                  {making ? "Making your video…" : "Make my avatar video"}
                </Button>
                {making && <p className="mt-1.5 text-[12px] text-spark-ink-muted">About 5 to 10 minutes. You can stay here or come back; it&apos;s in My Sparks too.</p>}
              </div>
            )}
            {way === "reel" && !video && (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {photos.map((p, i) => (
                    <span key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-14 w-20 rounded-lg object-cover" />
                      <button type="button" aria-label="Remove" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                        className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 shadow"><X size={11} /></button>
                    </span>
                  ))}
                  {photos.length < 12 && (
                    <button type="button" onClick={() => fileRef.current?.click()} className="flex h-14 w-20 items-center justify-center rounded-lg border border-dashed border-spark-rule text-spark-ink-muted">
                      {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[13px] text-spark-ink-soft">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={voice === "cards"} onChange={() => setVoice("cards")} className="accent-spark-amber" /> Words as text cards</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={voice === "voice"} onChange={() => setVoice("voice")} className="accent-spark-amber" /> My cloned voice reads them</label>
                  <select value={music} onChange={(e) => setMusic(e.target.value)} className="rounded-lg border border-spark-rule px-2 py-1">
                    {MUSIC_PRESETS.filter((m) => m.id !== "custom").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <Button size="sm" onClick={() => void makeReel()} loading={making} disabled={!photos.length}>{making ? "Making your reel…" : "Make my photo reel"}</Button>
              </div>
            )}
            {way === "mine" && (
              <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {videos.length === 0 && <p className="col-span-3 text-[13px] text-spark-ink-muted">No finished videos yet.</p>}
                {videos.map((v) => (
                  <button key={v.id} type="button" onClick={() => setVideo(v)}
                    className={`overflow-hidden rounded-lg border text-left ${video?.id === v.id ? "border-spark-amber ring-2 ring-spark-amber" : "border-spark-rule"}`}>
                    {v.thumbnail
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" />
                      : <div className="aspect-video w-full bg-slate-100" />}
                    <span className="block truncate px-2 py-1 text-[12px] text-spark-ink">{v.title}</span>
                  </button>
                ))}
              </div>
            )}
            {video && (
              <p className="mt-3 text-[13px] font-medium text-[#0f7a52]">
                ✓ Video ready · <a href={video.url} target="_blank" rel="noreferrer" className="underline">Watch it</a>
                {way !== "mine" && <> · <button type="button" className="underline" onClick={() => setVideo(null)}>Make another</button></>}
              </p>
            )}
          </Step>

          <Step n={3} title="The email">
            <p className={eyebrow}>Subject</p>
            <input className={`${input} mb-3`} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <p className={eyebrow}>Note</p>
            <textarea rows={6} value={note} onChange={(e) => { setNote(e.target.value); setNoteOwn(true); }} className={`${input} resize-none`} />
            <p className="mt-1 text-[12px] text-spark-ink-faint">
              {"{first name}"} becomes each person&apos;s first name.{" "}
              {noteOwn
                ? <button type="button" onClick={() => setNoteOwn(false)} className="font-semibold text-[#A3660F] underline">Match the video</button>
                : "Matches the video's words."}
            </p>
          </Step>

          <Step n={4} title="Send">
            <Button onClick={startSend} className="gap-1.5" disabled={!reviewUrl}><Send size={14} /> Send email{people.length ? ` to ${people.length}` : ""}</Button>
            <p className="mt-1.5 text-[12px] text-spark-ink-faint">
              {boldtrail
                ? "BoldTrail contacts get it from your BoldTrail address. Someone new you didn't add to BoldTrail gets it from you via SparkReels, with replies to your email."
                : `From "${signature.name || "you"} via SparkReels", and replies go to your email. It can land in Promotions or spam more than your own email; send yourself a test first.`}
            </p>
            {confirming && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-900">
                Send this to {people.map((p) => p.name || p.email).join(", ")}?
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[13px]">
                  <input type="checkbox" checked={copyMe} onChange={(e) => setCopyMe(e.target.checked)} className="h-4 w-4 accent-[#BA7517]" />
                  Send me a copy
                </label>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => void send()} loading={sending}>Send now</Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>Not yet</Button>
                </div>
              </div>
            )}
            {lastSent && (
              <p className="mt-2 text-[13px] text-spark-ink-soft">Last sent: {lastSent.map((r) => `${r.name}${r.sent ? " ✓" : " ✕"}`).join(", ")}</p>
            )}
          </Step>
        </div>

        <div>
          <p className="mb-2 text-[13px] text-spark-ink-muted">What they get{people[0] ? ` (as ${firstName(people[0]) || people[0].email} sees it)` : ""}</p>
          {built ? (
            <EmailResult subject={subject} html={built.html} text={built.text} />
          ) : (
            <div className="rounded-2xl border border-dashed border-spark-rule p-6 text-center text-sm text-spark-ink-muted">
              {!reviewUrl ? "Add your review link to see the email." : "Make or pick the video to see the email."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
