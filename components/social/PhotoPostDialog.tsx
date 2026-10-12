"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { INSTAGRAM_MAX_PHOTOS, PHOTO_PLATFORMS, partnerPlatform } from "@/lib/utils/social-platforms";

/**
 * Posts photos as they are: one photo, or several as a swipeable post.
 *
 * The small sibling of the Publish window, for things that are not videos: the
 * photos behind a photo reel, or a graphic from the Image Generator. No title,
 * thumbnail or schedule, because a photo post has none of them. Pick where,
 * write the caption, send.
 *
 * As with a video sent to these platforms, "sent" is not "posted": each one
 * takes a minute or two, so this says it is on its way and then reports each
 * as it lands.
 */
interface Account {
  id: string;
  platform: string;
  name: string;
  source?: "native" | "partner";
  needsReconnect?: boolean;
}

interface Props {
  /** Public addresses of the photos, in the order they should be swiped. */
  photos: string[];
  defaultCaption?: string;
  /** The picture was drawn by AI, which some platforms ask to be told. */
  aiMade?: boolean;
  onClose: () => void;
}

const label = (platform: string) => partnerPlatform(platform)?.label ?? platform;
const names = (platforms: string[]) => {
  const list = Array.from(new Set(platforms.map(label)));
  return list.length <= 2 ? list.join(" and ") : `${list.length} platforms`;
};

export function PhotoPostDialog({ photos, defaultCaption = "", aiMade = false, onClose }: Props) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [limit, setLimit] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState(defaultCaption);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/social/accounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const all: Account[] = d?.accounts ?? [];
        setAccounts(all.filter((a) => a.source === "partner" && (PHOTO_PLATFORMS as readonly string[]).includes(a.platform)));
        setAllowed(d?.more?.allowed !== false);
        setLimit(typeof d?.more?.limit === "number" ? d.more.limit : null);
      })
      .catch(() => setAccounts([]));
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  function toggle(a: Account) {
    if (a.needsReconnect) {
      toast.error(`${a.name} needs to be reconnected first. Open Settings, then Social Accounts.`);
      return;
    }
    const adding = !selected.includes(a.id);
    if (adding && limit !== null && selected.length >= limit) {
      toast.error(`Your plan posts to ${limit} of these at a time. Unselect one first.`);
      return;
    }
    setSelected((prev) => (adding ? [...prev, a.id] : prev.filter((id) => id !== a.id)));
  }

  /** Reports each platform as its real result arrives; gives up after a few minutes. */
  function follow(refs: string[]) {
    if (!refs.length) return;
    const told = new Set<string>();
    let checks = 0;
    timer.current = setInterval(async () => {
      checks += 1;
      try {
        const res = await fetch(`/api/social/status?${refs.map((r) => `ref=${encodeURIComponent(r)}`).join("&")}`);
        const data = await res.json();
        for (const post of (data.posts || []) as { platform: string; status: string; error?: string }[]) {
          if (told.has(post.platform)) continue;
          if (post.status === "posted") { told.add(post.platform); toast.success(`${label(post.platform)}: posted`); }
          if (post.status === "failed") { told.add(post.platform); toast.error(`${label(post.platform)}: ${post.error || "couldn't be posted"}`, { duration: 9000 }); }
        }
        if (!data.pending || checks >= 30) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
        }
      } catch { /* try again on the next tick */ }
    }, 6000);
  }

  async function send() {
    if (!selected.length) return toast.error("Choose where to post");
    if (!caption.trim()) return toast.error("Write a caption first");
    setSending(true);
    try {
      const res = await fetch("/api/social/post-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, caption, accountIds: selected, aiMade }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The post couldn't be sent.");
      const results = (data.results || []) as { platform: string; status: string; error?: string }[];
      for (const f of results.filter((r) => r.status === "failed")) {
        toast.error(`${label(f.platform)}: ${f.error || "couldn't be sent"}`, { duration: 8000 });
      }
      const going = results.filter((r) => r.status === "posting").map((r) => r.platform);
      // Nothing went anywhere: this is still the form.
      if (going.length === 0) return;
      setSent(going);
      follow(data.pendingRefs || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The post couldn't be sent.");
    } finally {
      setSending(false);
    }
  }

  const chosen = (accounts ?? []).filter((a) => selected.includes(a.id)).map((a) => a.platform);
  const overInstagram = chosen.includes("instagram") && photos.length > INSTAGRAM_MAX_PHOTOS;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-brand-text">
            {photos.length > 1 ? `Post ${photos.length} photos` : "Post this photo"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-slate-100">
            <X size={18} className="text-slate-400" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <p className="font-semibold text-brand-text">On its way!</p>
            <p className="text-sm text-slate-500">
              Going to {names(sent)}. That takes a minute or two, and we&apos;ll tell you here when it lands.
            </p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {/* The photos in swipe order, so what goes out is what is seen. */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {photos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${url}-${i}`} src={url} alt={`Photo ${i + 1}`} className="h-16 w-16 flex-none rounded-lg border border-slate-200 object-cover" />
              ))}
            </div>

            {accounts === null ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 size={15} className="animate-spin" /> Loading your accounts…
              </div>
            ) : !allowed ? (
              <p className="text-sm text-slate-600">
                Posting photos comes with a paid plan.{" "}
                <Link href="/billing" className="font-semibold text-primary-600 hover:underline">See plans</Link>
              </p>
            ) : accounts.length === 0 ? (
              <p className="text-sm text-slate-600">
                Connect Instagram, Facebook or another account first.{" "}
                <Link href="/settings/social" className="font-semibold text-primary-600 hover:underline">Open Settings</Link>
              </p>
            ) : (
              <>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Post to</p>
                  <div className="flex flex-wrap gap-1.5">
                    {accounts.map((a) => {
                      const on = selected.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggle(a)}
                          aria-pressed={on}
                          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            on
                              ? "border-primary-500 bg-primary-50 text-brand-text"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                          } ${a.needsReconnect ? "opacity-50" : ""}`}
                        >
                          {label(a.platform)}
                        </button>
                      );
                    })}
                  </div>
                  {overInstagram && (
                    <p className="mt-1.5 text-xs text-slate-500">Instagram takes the first {INSTAGRAM_MAX_PHOTOS}.</p>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Caption</label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    maxLength={2200}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <Button onClick={send} loading={sending} size="lg" className="w-full gap-2">
                  <Send size={16} />
                  {selected.length > 0 ? `Post to ${names(chosen)}` : "Choose where to post"}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
