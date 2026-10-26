"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, Plus, Search, Send, Trash2, Video, X } from "lucide-react";
import { EmailResult, SubjectPicker } from "@/components/email/email-result";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import {
  sellerUpdateAsHtml, sellerUpdateAsText, type SellerStats, type SellerUpdateEmail, type SellerVideo,
} from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";
import { SELLER_VIDEO_RETURN } from "@/lib/utils/seller-video-return";

/**
 * Seller Update (2026-10-15, the owner's mock): the update email to a
 * listing's sellers, sent whenever the agent likes. Listings are saved, so each
 * update starts with the last one's numbers beside the boxes and the email can
 * say what went up. An update can carry a video recorded on the camera, with
 * a script written from it. In Spark Tools (its own tab) and reached from
 * My Sparks (/tools?tab=seller&listing=<id>, &on=<date> to open one update).
 */



export interface SellerListing {
  id: string;
  address: string;
  seller_names: string | null;
  list_price: string | null;
  listed_on: string | null;
  last_update_at?: string | null;
  /** The sellers' BoldTrail contacts, added once by exact email (2026-10-15). */
  boldtrail_contacts?: { id: string; name: string; email: string }[];
}

type Week = {
  update_on: string;
  views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null;
  feedback: string | null; next_steps: string | null; email: SellerUpdateEmail | null;
  video_id: string | null; video_url: string | null; video_poster_url: string | null; video_seconds: number | null;
  sent_at: string | null; sent_to: { name: string; email: boolean; text: boolean | null }[] | null;
};

/** Today on the agent's own calendar, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const isDay = (v?: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const STAT_FIELDS: { key: "views" | "saves" | "showings" | "openHouse" | "offers"; label: string; col: keyof Week }[] = [
  { key: "views", label: "Online views", col: "views" },
  { key: "saves", label: "Saves", col: "saves" },
  { key: "showings", label: "Showings", col: "showings" },
  { key: "openHouse", label: "Open house visitors", col: "open_house_visitors" },
  { key: "offers", label: "Offers", col: "offers" },
];

const input = "w-full rounded-[10px] border border-spark-rule bg-[#fdfbf7] px-3 py-2 text-[16px] text-spark-ink outline-none focus:border-[#A3660F] sm:text-[14px]";
const label = "mb-1 block text-[12.5px] text-spark-ink-muted";
const eyebrow = "mb-2 text-[11.5px] font-bold uppercase tracking-[0.12em] text-spark-ink";

export function SellerUpdateTool({
  initialListingId,
  initialUpdateOn,
  startNew,
  onTrialLock,
}: {
  initialListingId?: string | null;
  initialUpdateOn?: string | null;
  startNew?: boolean;
  onTrialLock?: (data: unknown) => boolean;
}) {
  const router = useRouter();
  const today = useMemo(() => localToday(), []);
  // The update on screen: today's, or a past one opened from its date.
  const [updateOn, setUpdateOn] = useState(isDay(initialUpdateOn) ? initialUpdateOn : today);
  const [listings, setListings] = useState<SellerListing[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(!!startNew);
  const [draft, setDraft] = useState({ address: "", sellerNames: "", listPrice: "", listedOn: "" });
  // Properties already entered in the Listings & photos tab, offered when
  // adding a listing so the address needn't be typed again (2026-10-15).
  const [suggested, setSuggested] = useState<{ address: string; price: string | null; kind: string; created_at: string }[]>([]);
  useEffect(() => {
    if (!adding) return;
    fetch("/api/seller-listings?suggest=1")
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => setSuggested(d.suggestions ?? []))
      .catch(() => setSuggested([]));
  }, [adding, listings?.length]);

  // The week being written: the listing's details, the numbers and the notes.
  const [details, setDetails] = useState({ sellerNames: "", listPrice: "", listedOn: "" });
  const [stats, setStats] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [before, setBefore] = useState<SellerStats | null>(null);
  const [beforeOn, setBeforeOn] = useState<string | null>(null);
  const [pastDates, setPastDates] = useState<string[]>([]);
  // Sending through BoldTrail (2026-10-15): whether it's connected, this
  // listing's sellers there, and when this update went out.
  const [btConnected, setBtConnected] = useState(false);
  const [btContacts, setBtContacts] = useState<{ id: string; name: string; email: string }[]>([]);
  const [btEmail, setBtEmail] = useState("");
  const [btAdding, setBtAdding] = useState(false);
  /**
   * Find the seller by name as well as email (2026-10-26, the owner's ask).
   * Each match shows its email, and picking one still adds by that exact
   * email, so an update can't go to the wrong person.
   */
  const [btFound, setBtFound] = useState<{ id: string; name: string; email: string }[]>([]);
  const [btSearching, setBtSearching] = useState(false);
  const [btOpen, setBtOpen] = useState(false);
  const btSeq = useRef(0);
  useEffect(() => {
    const term = btEmail.trim();
    if (term.length < 2) { setBtFound([]); setBtSearching(false); return; }
    const mine = ++btSeq.current;
    setBtSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/boldtrail/search?q=${encodeURIComponent(term)}`);
        const d = await res.json().catch(() => ({}));
        if (mine !== btSeq.current) return;
        setBtFound(res.ok ? ((d.contacts ?? []) as { id: string; name: string; email: string }[]) : []);
      } catch {
        if (mine === btSeq.current) setBtFound([]);
      } finally {
        if (mine === btSeq.current) setBtSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [btEmail]);
  const [sentDates, setSentDates] = useState<string[]>([]);
  const [sent, setSent] = useState<{ at: string; to: { name: string; email: boolean; text: boolean | null }[] } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alsoText, setAlsoText] = useState(false);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    fetch("/api/integrations/boldtrail")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBtConnected(!!d?.connected))
      .catch(() => setBtConnected(false));
  }, []);
  const [video, setVideo] = useState<(SellerVideo & { id: string | null }) | null>(null);
  const [recording, setRecording] = useState(false);
  const [daysOnMarket, setDaysOnMarket] = useState<number | null>(null);
  const [signature, setSignature] = useState<EmailSignature>({});
  const [email, setEmail] = useState<SellerUpdateEmail | null>(null);
  const [emailStats, setEmailStats] = useState<SellerStats>({});
  const [subjectIdx, setSubjectIdx] = useState(0);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/seller-listings")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.listings ?? []) as SellerListing[];
        setListings(list);
        const first = (initialListingId && list.find((l) => l.id === initialListingId)) || list[0];
        if (first && !startNew) setSelectedId(first.id);
        if (!list.length) setAdding(true);
      })
      .catch(() => setListings([]));
  }, [initialListingId, startNew]);

  const loadWeek = useCallback(async (id: string, on: string) => {
    setLoadingWeek(true);
    setEmail(null);
    setVideo(null);
    try {
      const res = await fetch(`/api/seller-listings/update?listingId=${encodeURIComponent(id)}&updateOn=${on}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Couldn't open that listing.");
      const l = d.listing as SellerListing;
      setBtContacts(l.boldtrail_contacts ?? []);
      setSentDates((d.sentDates ?? []) as string[]);
      setDetails({ sellerNames: l.seller_names ?? "", listPrice: l.list_price ?? "", listedOn: l.listed_on ?? "" });
      const cur = d.current as Week | null;
      const prev = d.before as Week | null;
      setStats(Object.fromEntries(STAT_FIELDS.map((f) => [f.key, cur?.[f.col] != null ? String(cur[f.col]) : ""])));
      setFeedback(cur?.feedback ?? "");
      setNextSteps(cur?.next_steps ?? "");
      const b = prev
        ? { views: prev.views, saves: prev.saves, showings: prev.showings, openHouse: prev.open_house_visitors, offers: prev.offers }
        : null;
      setBefore(b);
      setBeforeOn(prev?.update_on ?? null);
      setPastDates(((d.dates ?? []) as string[]).filter((x) => x !== today));
      setVideo(cur?.video_url ? { id: cur.video_id, url: cur.video_url, posterUrl: cur.video_poster_url, seconds: cur.video_seconds } : null);
      setSent(cur?.sent_at ? { at: cur.sent_at, to: cur.sent_to ?? [] } : null);
      setDaysOnMarket(d.daysOnMarket ?? null);
      setSignature(d.signature ?? {});
      if (cur?.email) {
        setEmail(cur.email);
        setEmailStats({
          views: cur.views, saves: cur.saves, showings: cur.showings, openHouse: cur.open_house_visitors, offers: cur.offers,
        });
        setSubjectIdx(0);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that listing.");
    } finally {
      setLoadingWeek(false);
    }
  }, [today]);

  useEffect(() => { if (selectedId) void loadWeek(selectedId, updateOn); }, [selectedId, updateOn, loadWeek]);

  const selected = listings?.find((l) => l.id === selectedId) ?? null;

  async function addListing() {
    if (!draft.address.trim()) { toast.error("Enter the listing's address."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/seller-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Couldn't save the listing.");
      setListings((prev) => [d.listing, ...(prev ?? [])]);
      setSelectedId(d.listing.id);
      setAdding(false);
      setDraft({ address: "", sellerNames: "", listPrice: "", listedOn: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the listing.");
    } finally {
      setBusy(false);
    }
  }

  async function removeListing() {
    if (!selected) return;
    if (!window.confirm(`Take ${selected.address} off your listings? Its past updates are kept.`)) return;
    const res = await fetch(`/api/seller-listings?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't remove the listing."); return; }
    const rest = (listings ?? []).filter((l) => l.id !== selected.id);
    setListings(rest);
    setSelectedId(rest[0]?.id ?? null);
    if (!rest.length) setAdding(true);
  }

  async function writeUpdate() {
    if (!selected) return;
    setBusy(true);
    try {
      // The listing's own details first, when they were changed here.
      const changed =
        details.sellerNames !== (selected.seller_names ?? "") ||
        details.listPrice !== (selected.list_price ?? "") ||
        details.listedOn !== (selected.listed_on ?? "");
      if (changed) {
        const r = await fetch("/api/seller-listings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: selected.id, ...details }),
        });
        const d = await r.json();
        if (r.ok) setListings((prev) => (prev ?? []).map((l) => (l.id === selected.id ? { ...l, ...d.listing } : l)));
      }
      const res = await fetch("/api/seller-listings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected.id, updateOn, ...stats, feedback, nextSteps }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onTrialLock?.(d)) return;
        throw new Error(d?.error || "Couldn't write the update.");
      }
      setEmail(d.email);
      setEmailStats(d.stats ?? {});
      setBefore(d.before ?? null);
      if (!pastDates.includes(updateOn) && updateOn !== today) setPastDates((p) => [updateOn, ...p]);
      setDaysOnMarket(d.daysOnMarket ?? null);
      setSignature(d.signature ?? {});
      setSubjectIdx(0);
      setListings((prev) => (prev ?? []).map((l) => (l.id === selected.id ? { ...l, last_update_at: new Date().toISOString() } : l)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write the update.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Saves the numbers, writes what to say from them, and opens the camera
   * with it on the teleprompter. Spark Studio reads SELLER_VIDEO_RETURN to
   * offer "Add to the seller update" once the take is saved.
   */
  async function recordVideo() {
    if (!selected) return;
    setRecording(true);
    try {
      const res = await fetch("/api/seller-listings/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected.id, updateOn, ...stats, feedback, nextSteps, action: "script" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onTrialLock?.(d)) return;
        throw new Error(d?.error || "Couldn't write the script.");
      }
      sessionStorage.setItem("camera-record-script", d.script);
      sessionStorage.setItem(SELLER_VIDEO_RETURN, JSON.stringify({ listingId: selected.id, updateOn, address: selected.address }));
      router.push("/create?tab=camera");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't write the script.");
      setRecording(false);
    }
  }

  async function addBtContact(pickedEmail?: string) {
    const email = (pickedEmail ?? btEmail).trim();
    if (!selected || !email.includes("@")) return;
    setBtAdding(true);
    setBtOpen(false);
    try {
      const res = await fetch("/api/seller-listings/boldtrail-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected.id, email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't add that seller.");
      setBtContacts(d.contacts ?? []);
      setBtEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add that seller.");
    } finally {
      setBtAdding(false);
    }
  }

  async function removeBtContact(id: string) {
    if (!selected) return;
    const res = await fetch(`/api/seller-listings/boldtrail-contacts?listingId=${encodeURIComponent(selected.id)}&contactId=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setBtContacts(d.contacts ?? []);
  }

  /** Only from Send now in the confirmation; nothing sends on its own. */
  async function sendThroughBoldTrail() {
    if (!selected) return;
    setSending(true);
    try {
      const res = await fetch("/api/seller-listings/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: selected.id, updateOn, subjectIdx, alsoText }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || "Couldn't send it.");
      setSent({ at: d.sentAt, to: d.results ?? [] });
      if (!sentDates.includes(updateOn)) setSentDates((s) => [...s, updateOn]);
      const failed = (d.results ?? []).filter((r: { email: boolean }) => !r.email);
      if (failed.length) toast.error(`Not sent to ${failed.map((r: { name: string }) => r.name).join(" and ")}.`);
      else toast.success("Sent through BoldTrail.");
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send it.");
    } finally {
      setSending(false);
    }
  }

  async function removeVideo() {
    if (!selected) return;
    const res = await fetch(`/api/seller-listings/video?listingId=${encodeURIComponent(selected.id)}&updateOn=${updateOn}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't remove the video."); return; }
    setVideo(null);
  }

  const subject = email?.subjects[Math.min(subjectIdx, email.subjects.length - 1)] ?? "";
  const built = useMemo(() => {
    if (!email) return null;
    return {
      html: sellerUpdateAsHtml(email, { subject, stats: emailStats, before, signature, video }),
      text: sellerUpdateAsText(email, { stats: emailStats, before, signature, video }),
    };
  }, [email, subject, emailStats, before, signature, video]);

  if (listings === null) {
    return <div className="flex items-center gap-2 py-8 text-spark-ink-muted"><Loader2 size={16} className="animate-spin" /> Loading your listings…</div>;
  }

  const chip = "rounded-full border px-3.5 py-1.5 text-[13.5px] transition-colors";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {listings.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => { setSelectedId(l.id); setUpdateOn(today); setAdding(false); }}
            className={`${chip} ${l.id === selectedId && !adding ? "border-spark-ink bg-spark-ink text-white" : "border-spark-rule bg-white text-spark-ink hover:border-[#d9c6a8]"}`}
          >
            {l.address}{l.seller_names ? ` · ${l.seller_names}` : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`${chip} flex items-center gap-1 border-dashed border-[#d9c6a8] bg-white font-semibold text-[#A3660F]`}
        >
          <Plus size={14} /> Add a listing
        </button>
      </div>

      {!adding && selected && pastDates.length > 0 && (
        <div className="-mt-1 mb-4 flex flex-wrap items-center gap-1.5 text-[12.5px] text-spark-ink-muted">
          Past updates:
          {updateOn !== today && (
            <button type="button" onClick={() => setUpdateOn(today)} className="rounded-lg border border-[#A3660F] bg-white px-2.5 py-1 font-semibold text-[#A3660F]">
              New update
            </button>
          )}
          {pastDates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setUpdateOn(d)}
              className={`rounded-lg border px-2.5 py-1 ${d === updateOn ? "border-spark-ink bg-spark-ink text-white" : "border-spark-rule bg-white text-spark-ink hover:border-[#d9c6a8]"}`}
            >
              {dayLabel(d)}{sentDates.includes(d) && <span className={d === updateOn ? "text-green-300" : "text-green-700"}> · sent</span>}
            </button>
          ))}
        </div>
      )}

      {adding ? (
        <div className="max-w-[640px] rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
          <p className={eyebrow}>New listing</p>
          {suggested.length > 0 && (
            <div className="mb-4 rounded-xl bg-[#fdf3e2] p-3">
              <p className="mb-2 text-[12.5px] text-spark-ink-muted">From your listings</p>
              <div className="flex flex-wrap gap-2">
                {suggested.map((s) => {
                  const on = draft.address === s.address;
                  return (
                    <button
                      key={s.address}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, address: s.address, listPrice: s.price ?? d.listPrice }))}
                      className={`flex flex-col rounded-[10px] border bg-white px-3 py-1.5 text-left text-[13px] text-spark-ink transition-colors ${
                        on ? "border-[#A3660F] ring-1 ring-[#A3660F]" : "border-[#d9c6a8] hover:border-[#A3660F]"
                      }`}
                    >
                      {s.address}
                      <span className="text-[11.5px] text-spark-ink-muted">
                        {[s.price, s.kind, new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className={label}>Address</span>
              <input className={input} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="12 Oak Lane" />
            </label>
            <label><span className={label}>Sellers&apos; first names</span>
              <input className={input} value={draft.sellerNames} onChange={(e) => setDraft({ ...draft, sellerNames: e.target.value })} placeholder="Dan and Lisa" />
            </label>
            <label><span className={label}>List price</span>
              <input className={input} value={draft.listPrice} onChange={(e) => setDraft({ ...draft, listPrice: e.target.value })} placeholder="$549,000" />
            </label>
            <label><span className={label}>Listed on</span>
              <input type="date" className={input} value={draft.listedOn} onChange={(e) => setDraft({ ...draft, listedOn: e.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={addListing} disabled={busy} className="spark-cta-gradient flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
              {busy && <Loader2 size={13} className="animate-spin" />} Save the listing
            </button>
            {listings.length > 0 && (
              <button type="button" onClick={() => setAdding(false)} className="rounded-[10px] border border-spark-rule bg-white px-4 py-2 text-[13px] font-semibold text-spark-ink">
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : selected && (
        <div className="grid gap-5 lg:grid-cols-2 lg:items-stretch">
          {/* This week's numbers and notes. */}
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className={`${eyebrow} mb-0`}>
                Update · {dayLabel(updateOn)}
                {beforeOn && <span className="ml-2 font-normal normal-case tracking-normal text-spark-ink-muted">compared with {dayLabel(beforeOn)}</span>}
              </p>
              <button type="button" onClick={removeListing} className="flex items-center gap-1 text-[12px] text-spark-ink-muted hover:text-red-600">
                <Trash2 size={12} /> Remove listing
              </button>
            </div>
            {loadingWeek ? (
              <div className="flex items-center gap-2 py-6 text-spark-ink-muted"><Loader2 size={15} className="animate-spin" /> Loading…</div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label><span className={label}>Sellers&apos; first names</span>
                    <input className={input} value={details.sellerNames} onChange={(e) => setDetails({ ...details, sellerNames: e.target.value })} />
                  </label>
                  <label><span className={label}>List price</span>
                    <input className={input} value={details.listPrice} onChange={(e) => setDetails({ ...details, listPrice: e.target.value })} />
                  </label>
                </div>
                {btConnected && (
                  <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                    <p className="mb-2 text-[12px] font-bold text-orange-800">Sellers in BoldTrail</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {btContacts.map((c) => (
                        <span key={c.id} className="flex items-center gap-1.5 rounded-full border border-orange-300 bg-white px-2.5 py-1 text-[12.5px] text-spark-ink">
                          {c.name}<span className="text-[11px] text-orange-800">{c.email}</span>
                          <button type="button" onClick={() => removeBtContact(c.id)} aria-label={`Remove ${c.name}`} className="text-spark-ink-muted hover:text-red-600"><X size={12} /></button>
                        </span>
                      ))}
                      {btContacts.length < 4 && (
                        <span className="relative flex min-w-[220px] flex-1 items-center gap-1.5">
                          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-spark-ink-faint" />
                          <input
                            type="text"
                            name="seller-boldtrail-search"
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            value={btEmail}
                            onChange={(e) => { setBtEmail(e.target.value); setBtOpen(true); }}
                            onFocus={() => setBtOpen(true)}
                            onBlur={() => setTimeout(() => setBtOpen(false), 150)}
                            onKeyDown={(e) => {
                              if (e.key !== "Enter") return;
                              e.preventDefault();
                              if (btEmail.includes("@")) void addBtContact();
                              else if (btFound[0]) void addBtContact(btFound[0].email);
                            }}
                            placeholder="Seller's name or email in BoldTrail"
                            className={`${input} py-1.5 pl-7`}
                          />
                          <button type="button" onClick={() => void addBtContact()} disabled={btAdding || !btEmail.includes("@")} className="flex shrink-0 items-center gap-1 rounded-[10px] border border-orange-300 bg-white px-2.5 py-1.5 text-[12.5px] font-semibold text-orange-800 disabled:opacity-50">
                            {btAdding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
                          </button>
                          {btOpen && btEmail.trim().length >= 2 && (
                            <span className="absolute left-0 right-0 top-full z-30 mt-1 block max-h-64 overflow-y-auto rounded-xl border border-spark-rule bg-white shadow-lg">
                              {btSearching && btFound.length === 0 && (
                                <span className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-spark-ink-muted"><Loader2 size={13} className="animate-spin" /> Searching BoldTrail…</span>
                              )}
                              {!btSearching && btFound.length === 0 && (
                                <span className="block px-3 py-2 text-[13px] text-spark-ink-muted">No BoldTrail contact starts with &ldquo;{btEmail.trim()}&rdquo;.</span>
                              )}
                              {btFound.filter((c) => !btContacts.some((x) => x.id === c.id)).map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => void addBtContact(c.email)}
                                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13px] hover:bg-orange-50"
                                >
                                  <span className="font-semibold text-spark-ink">{c.name}</span>
                                  <span className="truncate text-[12px] text-orange-800">{c.email}</span>
                                </button>
                              ))}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {STAT_FIELDS.map((f) => {
                    const was = before?.[f.key];
                    return (
                      <label key={f.key}><span className={label}>{f.label}</span>
                        <div className="relative">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            className={`${input} pr-16`}
                            value={stats[f.key] ?? ""}
                            onChange={(e) => setStats({ ...stats, [f.key]: e.target.value })}
                          />
                          {typeof was === "number" && (
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-spark-ink-muted" title="Last week">
                              last {was}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  <label><span className={label}>Listed on</span>
                    <input type="date" className={input} value={details.listedOn} onChange={(e) => setDetails({ ...details, listedOn: e.target.value })} />
                    {typeof daysOnMarket === "number" && details.listedOn === (selected.listed_on ?? "") && (
                      <span className="mt-1 block text-[11.5px] text-spark-ink-muted">{daysOnMarket} days on market</span>
                    )}
                  </label>
                </div>
                <label className="mt-3 block"><span className={`${label} flex items-center justify-between`}>Buyer feedback
                  <FieldMic title="Say the feedback" silenceMs={PROSE_SILENCE_MS} onTranscript={(t) => setFeedback((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
                </span>
                  <textarea rows={3} className={input} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What buyers and their agents said" />
                </label>
                <label className="mt-3 block"><span className={`${label} flex items-center justify-between`}>Next steps
                  <FieldMic title="Say the next steps" silenceMs={PROSE_SILENCE_MS} onTranscript={(t) => setNextSteps((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
                </span>
                  <textarea rows={3} className={input} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} placeholder="Open house, price, marketing, what you'll do next" />
                </label>
                <div className="mt-auto pt-4">
                  <button type="button" onClick={writeUpdate} disabled={busy} className="spark-cta-gradient flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} {email ? "Write it again →" : "Write the update →"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* The video update, then the email. */}
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#fdf3e2] p-3">
              {video?.posterUrl ? (
                <a href={video.url} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.posterUrl} alt="Your video update" className="h-[68px] w-[120px] rounded-lg object-cover" />
                </a>
              ) : (
                <span className="flex h-[68px] w-[120px] shrink-0 items-center justify-center rounded-lg bg-[#3b2d20] text-white">
                  <Video size={22} />
                </span>
              )}
              <div className="min-w-0 flex-1 text-[13px] text-spark-ink-muted">
                <b className="block text-[14px] text-spark-ink">Video update</b>
                {video ? "In the email, above the numbers. Sellers tap it to watch." : "Record a short video for them. It goes at the top of the email."}
              </div>
              {video ? (
                <button type="button" onClick={removeVideo} className="flex items-center gap-1 rounded-[10px] border border-spark-rule bg-white px-3 py-1.5 text-[12.5px] font-semibold text-spark-ink">
                  <X size={13} /> Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={recordVideo}
                  disabled={recording || loadingWeek}
                  className="flex items-center gap-1.5 rounded-[10px] bg-spark-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {recording ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />} Record a video update
                </button>
              )}
            </div>
            {email && built ? (
              <>
                <p className={eyebrow}>Subject line</p>
                <SubjectPicker subjects={email.subjects} value={subjectIdx} onChange={setSubjectIdx} />
                <p className={`${eyebrow} mt-4`}>Preview</p>
                <EmailResult
                  subject={subject}
                  html={built.html}
                  text={built.text}
                  leading={btConnected && btContacts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => { setAlsoText(false); setConfirming(true); }}
                      className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      <Send size={13} /> Send to sellers through BoldTrail
                    </button>
                  ) : undefined}
                  footer={sent ? (
                    <p className="mt-2 text-[12.5px] font-semibold text-green-700">
                      ✓ Sent {new Date(sent.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      {sent.to.length ? ` to ${sent.to.filter((r) => r.email).map((r) => r.name).join(" and ")}` : ""}
                      {sent.to.some((r) => r.text) ? ", with a text" : ""}
                    </p>
                  ) : undefined}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-spark-rule p-8 text-center text-[14px] text-spark-ink-muted">
                Fill in the numbers and notes, then Write the update.
              </div>
            )}
          </div>
        </div>
      )}

      {confirming && selected && email && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !sending && setConfirming(false)}>
          <div role="dialog" aria-label="Send this update?" className="w-full max-w-[440px] rounded-2xl border border-spark-rule bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-[17px] font-bold text-spark-ink">{sent ? "Send this update again?" : "Send this update?"}</h3>
            {sent && (
              <p className="mb-2 text-[13px] text-orange-800">
                It already went out {new Date(sent.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.
              </p>
            )}
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>To:</b> {btContacts.map((c) => c.name).join(", ")}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>Subject:</b> {subject}</p>
            <p className="my-1.5 text-[14px] text-spark-ink-soft"><b>From:</b> your BoldTrail email</p>
            <label className="my-3 flex items-start gap-2 text-[13.5px] text-spark-ink-soft">
              <input type="checkbox" checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
              <span>Also text them: &ldquo;I just emailed your update for {selected.address}.&rdquo;</span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="rounded-[10px] border border-spark-rule bg-white px-4 py-2 text-[13.5px] font-semibold text-spark-ink">
                Cancel
              </button>
              <button type="button" onClick={sendThroughBoldTrail} disabled={sending} className="flex items-center gap-1.5 rounded-[10px] bg-orange-600 px-4 py-2 text-[13.5px] font-bold text-white disabled:opacity-60">
                {sending && <Loader2 size={14} className="animate-spin" />} Send now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
