"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Home, Loader2, ArrowRight, Link2, PencilLine, CheckCircle,
  X, BedDouble, Bath, Ruler, Calendar, DollarSign, Image as ImageIcon,
} from "lucide-react";
import type { ListingData } from "@/app/api/ai/scrape-listing/route";

type Step = "url" | "scraping" | "review" | "generating";

const EMPTY_LISTING: ListingData = {
  address: "",
  price: "",
  beds: null,
  baths: null,
  sqft: null,
  yearBuilt: null,
  propertyType: "Single Family",
  description: "",
  features: [],
  photoUrls: [],
  agentName: "",
  mlsId: "",
  daysOnMarket: null,
  garage: "",
  lotSize: "",
  neighborhood: "",
};

const PROPERTY_TYPES = ["Single Family", "Condo", "Townhouse", "Multi-Family", "Land", "Other"];

export function ListingVideoForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [listing, setListing] = useState<ListingData>(EMPTY_LISTING);
  const [newFeature, setNewFeature] = useState("");
  const [manualMode, setManualMode] = useState(false);

  // ── Scrape ─────────────────────────────────────────────────────────────────
  async function handleScrape() {
    if (!url.trim()) return toast.error("Paste a listing URL first");
    setStep("scraping");
    try {
      const res = await fetch("/api/ai/scrape-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scrape failed");
      setListing(data.listing);
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read listing");
      setStep("url");
    }
  }

  function handleManual() {
    setManualMode(true);
    setListing(EMPTY_LISTING);
    setStep("review");
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!listing.address.trim()) return toast.error("Address is required");
    if (!listing.price.trim()) return toast.error("Price is required");
    setStep("generating");
    try {
      const res = await fetch("/api/ai/listing-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      toast.success("Listing script ready!");
      router.push(`/create/${data.project.id}?source=listing`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setStep("review");
    }
  }

  // ── Feature tag helpers ────────────────────────────────────────────────────
  function addFeature() {
    if (!newFeature.trim() || listing.features.length >= 8) return;
    setListing((l) => ({ ...l, features: [...l.features, newFeature.trim()] }));
    setNewFeature("");
  }

  function removeFeature(i: number) {
    setListing((l) => ({ ...l, features: l.features.filter((_, idx) => idx !== i) }));
  }

  // ── URL step ───────────────────────────────────────────────────────────────
  if (step === "url") {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
            Paste Listing URL
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScrape()}
                placeholder="https://zillow.com/homedetails/..."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <Button onClick={handleScrape} disabled={!url.trim()} className="gap-1.5 shrink-0">
              Import <ArrowRight size={14} />
            </Button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Supported: Zillow · Realtor.com · Redfin · Homes.com · Trulia · Compass
          </p>
        </div>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <button
          onClick={handleManual}
          className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all text-sm font-medium text-slate-600 hover:text-primary-600"
        >
          <PencilLine size={16} />
          Enter listing details manually
        </button>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-xs text-blue-700 leading-relaxed">
            <strong>What happens next:</strong> We import the listing details, then use AI to write
            a Fair Housing-compliant 60–90 second property tour voiceover script. Takes ~15 seconds.
          </p>
        </div>
      </div>
    );
  }

  // ── Scraping step ──────────────────────────────────────────────────────────
  if (step === "scraping") {
    return (
      <div className="flex flex-col items-center py-12 gap-4 text-center">
        <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center">
          <Home className="w-8 h-8 text-primary-500 animate-pulse" />
        </div>
        <div>
          <p className="font-semibold text-brand-text">Reading listing details…</p>
          <p className="text-sm text-slate-400 mt-1">Importing from {new URL(url).hostname}</p>
        </div>
      </div>
    );
  }

  // ── Generating step ────────────────────────────────────────────────────────
  if (step === "generating") {
    return (
      <div className="flex flex-col items-center py-12 gap-4 text-center">
        <div className="w-16 h-16 bg-secondary-500/10 rounded-2xl flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-secondary-500 animate-spin" />
        </div>
        <div>
          <p className="font-semibold text-brand-text">Writing your property tour script…</p>
          <p className="text-sm text-slate-400 mt-1">AI is crafting a Fair Housing-compliant voiceover</p>
        </div>
      </div>
    );
  }

  // ── Review / Edit step ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {manualMode ? "Listing Details" : "Review Imported Details"}
          </p>
          {!manualMode && (
            <p className="text-xs text-slate-400 mt-0.5">Edit anything that looks wrong</p>
          )}
        </div>
        {!manualMode && (
          <button
            onClick={() => { setStep("url"); setListing(EMPTY_LISTING); }}
            className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
          >
            <X size={12} /> Change URL
          </button>
        )}
      </div>

      {/* Address */}
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1.5">
          Address <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={listing.address}
          onChange={(e) => setListing((l) => ({ ...l, address: e.target.value }))}
          placeholder="123 Main St, Austin, TX 78701"
          className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>

      {/* Price + Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1.5">
            <DollarSign size={11} /> Price <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={listing.price}
            onChange={(e) => setListing((l) => ({ ...l, price: e.target.value }))}
            placeholder="$450,000"
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">Property Type</label>
          <select
            value={listing.propertyType}
            onChange={(e) => setListing((l) => ({ ...l, propertyType: e.target.value }))}
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          >
            {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Beds / Baths / Sqft / Year */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { key: "beds", label: "Beds", icon: BedDouble, placeholder: "3" },
          { key: "baths", label: "Baths", icon: Bath, placeholder: "2" },
          { key: "sqft", label: "Sq Ft", icon: Ruler, placeholder: "1800" },
          { key: "yearBuilt", label: "Built", icon: Calendar, placeholder: "2005" },
        ].map(({ key, label, icon: Icon, placeholder }) => (
          <div key={key}>
            <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1.5">
              <Icon size={11} /> {label}
            </label>
            <input
              type="number"
              value={listing[key as keyof ListingData] ?? ""}
              onChange={(e) => setListing((l) => ({
                ...l,
                [key]: e.target.value ? Number(e.target.value) : null,
              }))}
              placeholder={placeholder}
              className="w-full text-sm px-2.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        ))}
      </div>

      {/* Garage + Lot */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">Garage</label>
          <input
            type="text"
            value={listing.garage}
            onChange={(e) => setListing((l) => ({ ...l, garage: e.target.value }))}
            placeholder="2-car attached"
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">Lot Size</label>
          <input
            type="text"
            value={listing.lotSize}
            onChange={(e) => setListing((l) => ({ ...l, lotSize: e.target.value }))}
            placeholder="0.25 acres"
            className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1.5">
          Property Description
          <span className="text-slate-400 font-normal ml-1">(AI will use this in the script)</span>
        </label>
        <textarea
          value={listing.description}
          onChange={(e) => setListing((l) => ({ ...l, description: e.target.value }))}
          placeholder="Stunning 3-bedroom home with open floor plan, chef's kitchen, and private backyard..."
          rows={3}
          className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        />
      </div>

      {/* Features */}
      <div>
        <label className="text-xs font-medium text-slate-500 block mb-1.5">
          Key Features <span className="text-slate-400 font-normal">(up to 8)</span>
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {listing.features.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full border border-primary-200"
            >
              <CheckCircle size={10} />
              {f}
              <button onClick={() => removeFeature(i)} className="hover:text-red-500 transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        {listing.features.length < 8 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newFeature}
              onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFeature()}
              placeholder="e.g. Quartz countertops, Pool, Smart home…"
              className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <Button variant="outline" size="sm" onClick={addFeature} disabled={!newFeature.trim()}>
              Add
            </Button>
          </div>
        )}
      </div>

      {/* Photo count note */}
      {listing.photoUrls.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
          <ImageIcon size={13} className="text-slate-400" />
          {listing.photoUrls.length} listing photos imported — AI may use these as b-roll
        </div>
      )}

      {/* Fair Housing notice */}
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
        <p className="text-xs text-blue-700 leading-relaxed">
          🏛️ <strong>Fair Housing AI</strong> — Your script will be automatically reviewed to ensure compliance
          with the Fair Housing Act. We never include demographic, school, or community-composition language.
        </p>
      </div>

      {/* Generate button */}
      <Button
        onClick={handleGenerate}
        disabled={!listing.address.trim() || !listing.price.trim()}
        size="lg"
        className="w-full gap-2"
      >
        Generate Listing Video Script <ArrowRight size={16} />
      </Button>
    </div>
  );
}
