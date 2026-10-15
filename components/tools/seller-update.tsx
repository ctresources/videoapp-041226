"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { EmailResult, SubjectPicker } from "@/components/email/email-result";
import { FieldMic, PROSE_SILENCE_MS } from "@/components/ui/field-mic";
import {
  sellerUpdateAsHtml, sellerUpdateAsText, type SellerStats, type SellerUpdateEmail,
} from "@/lib/utils/newsletter-html";
import type { EmailSignature } from "@/lib/utils/email-html";

/**
 * Seller Update (2026-10-15, the owner's mock): the weekly email to a
 * listing's sellers. Listings are saved, so each week starts with last week's
 * numbers beside the boxes and the email can say what went up. In Spark Tools
 * (its own tab) and reached from My Sparks (/tools?tab=seller&listing=<id>).
 */

export interface SellerListing {
  id: string;
  address: string;
  seller_names: string | null;
  list_price: string | null;
  listed_on: string | null;
  last_update_at?: string | null;
}

type Week = {
  views: number | null; saves: number | null; showings: number | null;
  open_house_visitors: number | null; offers: number | null;
  feedback: string | null; next_steps: string | null; email: SellerUpdateEmail | null;
};

/** This week's Monday on the agent's own calendar, as YYYY-MM-DD. */
export function thisWeekOf(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const weekLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
  startNew,
  onTrialLock,
}: {
  initialListingId?: string | null;
  startNew?: boolean;
  onTrialLock?: (data: unknown) => boolean;
}) {
  const weekOf = useMemo(() => thisWeekOf(), []);
  const [listings, setListings] = useState<SellerListing[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(!!startNew);
  const [draft, setDraft] = useState({ address: "", sellerNames: "", listPrice: "", listedOn: "" });

  // The week being written: the listing's details, the numbers and the notes.
  const [details, setDetails] = useState({ sellerNames: "", listPrice: "", listedOn: "" });
  const [stats, setStats] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [before, setBefore] = useState<SellerStats | null>(null);
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

  const loadWeek = useCallback(async (id: string) => {
    setLoadingWeek(true);
    setEmail(null);
    try {
      const res = await fetch(`/api/seller-listings/update?listingId=${encodeURIComponent(id)}&weekOf=${weekOf}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || "Couldn't open that listing.");
      const l = d.listing as SellerListing;
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
  }, [weekOf]);

  useEffect(() => { if (selectedId) void loadWeek(selectedId); }, [selectedId, loadWeek]);

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
        body: JSON.stringify({ listingId: selected.id, weekOf, ...stats, feedback, nextSteps }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (onTrialLock?.(d)) return;
        throw new Error(d?.error || "Couldn't write the update.");
      }
      setEmail(d.email);
      setEmailStats(d.stats ?? {});
      setBefore(d.before ?? null);
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

  const subject = email?.subjects[Math.min(subjectIdx, email.subjects.length - 1)] ?? "";
  const built = useMemo(() => {
    if (!email) return null;
    return {
      html: sellerUpdateAsHtml(email, { subject, stats: emailStats, before, signature }),
      text: sellerUpdateAsText(email, { stats: emailStats, before, signature }),
    };
  }, [email, subject, emailStats, before, signature]);

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
            onClick={() => { setSelectedId(l.id); setAdding(false); }}
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

      {adding ? (
        <div className="max-w-[640px] rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
          <p className={eyebrow}>New listing</p>
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
              <p className={`${eyebrow} mb-0`}>Week of {weekLabel(weekOf)}</p>
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

          {/* The email. */}
          <div className="flex flex-col rounded-2xl border border-spark-rule bg-white p-4 sm:p-5">
            {email && built ? (
              <>
                <p className={eyebrow}>Subject line</p>
                <SubjectPicker subjects={email.subjects} value={subjectIdx} onChange={setSubjectIdx} />
                <p className={`${eyebrow} mt-4`}>Preview</p>
                <EmailResult subject={subject} html={built.html} text={built.text} />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-spark-rule p-8 text-center text-[14px] text-spark-ink-muted">
                Fill in this week&apos;s numbers and notes, then Write the update.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
