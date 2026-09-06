"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Home, Loader2, ArrowRight, Link2, PencilLine, CheckCircle,
  X, BedDouble, Bath, Ruler, Calendar, DollarSign, Image as ImageIcon,
  Upload, FileText, Camera, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { ListingData } from "@/app/api/ai/scrape-listing/route";
import { createClient } from "@/lib/supabase/client";
import { coerceListing } from "@/lib/utils/listing-data";
import { currentUserId } from "@/lib/utils/upload-photo";
import { RENDERED_SCRIPT_LENGTHS, ceilMinutesFor, type VideoLength } from "@/lib/utils/video-length";

/**
 * Upload a single image directly from the browser to Supabase Storage.
 * Bypasses Vercel's ~4.5MB serverless body limit. RLS policy
 * "Users upload own assets" allows authenticated users to write to
 * `assets/{userId}/...`. Returns the public URL.
 */
/**
 * @param userId resolved once by the caller, before the uploads start.
 *
 * Not looked up in here. Supabase guards the stored auth token with a Web
 * Lock, and this took that lock on every call — so a batch of listing photos
 * uploading together contended for it and one request stole it from another:
 * `Lock "lock:sb-…-auth-token" was released because another request stole it`.
 * The photo reel had the identical bug and hit it on a phone, where a slower
 * connection keeps every upload in flight at once.
 */
async function uploadPhotoToStorage(file: File, userId: string): Promise<string> {
  const supabase = createClient();

  const extFromType = (file.type.split("/")[1] || "jpg").toLowerCase();
  const ext = extFromType.includes("jpeg") ? "jpg" : extFromType.replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/listing-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw new Error(error.message || "Upload failed");

  const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(path);
  return publicUrl;
}

type Step = "url" | "scraping" | "review" | "generating" | "parsing-file";

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

export function ListingVideoForm({ onRecordYourself, onListingPhotos }: {
  /**
   * Hand the finished script and the listing's photos to the camera tab.
   *
   * The editor's teleprompter cannot composite photos — only CameraRecorder
   * can, and only there are they rehosted first, which canvas recording
   * requires. Sending a listing to the editor to be read aloud therefore
   * dropped every photo, on the one flow where the photos are the video. So
   * this crosses to the recorder that works instead of building a second one.
   */
  onRecordYourself?: (script: string, photoUrls: string[]) => void;
  /**
   * Report the listing's photos and address up to the tab, so the Photo reel
   * beside this form can start from them.
   *
   * The two sit under one tab and looked like two ways to use the same
   * listing, but the reel could only ever see photos uploaded into its own
   * grid — import a Zillow URL and the one feature built to turn photos into a
   * video was the one thing that could not see them.
   */
  onListingPhotos?: (photoUrls: string[], address: string) => void;
} = {}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("url");
  const [url, setUrl] = useState("");
  const [listing, setListing] = useState<ListingData>(EMPTY_LISTING);
  /**
   * Keep the tab told about the photos, so switching to the Photo reel starts
   * from this listing rather than an empty grid. Fires on every change so a
   * scrape, an upload and a removal all reach it.
   */
  useEffect(() => {
    onListingPhotos?.(listing.photoUrls ?? [], listing.address ?? "");
    // onListingPhotos is an inline arrow in the parent and would re-run this
    // every render if it were a dependency; the photos are what it is watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.photoUrls, listing.address]);
  const [newFeature, setNewFeature] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [videoLength, setVideoLength] = useState<VideoLength>("standard");
  /**
   * Unbranded script — no agent name and no closing ask, for the cut most MLS
   * boards require of listing media. Set here rather than after the fact
   * because it changes how the script is written, not just what is drawn over
   * it: an unbranded overlay on a script that says "call me" is not compliant.
   */
  const [unbranded, setUnbranded] = useState(false);
  // Defaults to the avatar, which is what the editor has always defaulted to —
  // this only makes the other choice reachable before the script is written,
  // rather than two screens later.
  /**
   * Still sent, no longer asked here — see the note where the picker used to
   * be. This is the setup screen's own default, so ai_script.render_mode
   * exists for it to read back and the editor opens exactly as it did before.
   */
  const renderMode: "voice_only" | "avatar_voice" = "avatar_voice";
  // Long videos are a separate allowance. Offering the option to someone with
  // none would write an eight-minute script the render then refuses — so the
  // choice only appears once there is one to spend. The server checks too;
  // this is what stops the dead end being reachable.
  const [longAvailable, setLongAvailable] = useState(false);

  useEffect(() => {
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a && setLongAvailable(a.isAdmin || a.long > 0))
      .catch(() => {});
  }, []);

  const MAX_LISTING_PHOTOS = 12;

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
      // Coerced here too, not only on the server: a listing saved before
      // that fix can still hold nulls, and one null price is enough to
      // take the whole page down on `price.trim()`.
      setListing(coerceListing(data.listing));
      setStep("review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read listing");
      setStep("url");
    }
  }

  function handleManual() {
    setManualMode(true);
    // Keep any photos already uploaded on the URL step. "Next: Add Listing
    // Details" is the only way forward after uploading them, and resetting to
    // EMPTY_LISTING here threw every one of them away on the way to the form.
    setListing((l) => ({ ...EMPTY_LISTING, photoUrls: l.photoUrls }));
    setStep("review");
  }

  // ── Upload File (any type) ─────────────────────────────────────────────────
  async function handleFileUpload(file: File) {
    // If the user picks an image here, treat it as a listing photo (not a doc).
    // This avoids the "couldn't read file" warning when an image was uploaded
    // to the parser, and lets them keep adding photos.
    if (file.type.startsWith("image/")) {
      if (file.size > 15 * 1024 * 1024) {
        return toast.error("Photo is too large. Max 15 MB per photo.");
      }
      setUploadedFileName(file.name);
      setUploadingPhotos(true);
      try {
        // Single file, so there is nothing to contend with — it just needs the
        // id the shared uploader no longer looks up for itself.
        const url = await uploadPhotoToStorage(file, await currentUserId());
        setListing((l) => ({ ...l, photoUrls: [...l.photoUrls, url] }));
        setManualMode(true);
        setStep("review");
        toast.success(`Added ${file.name} to listing photos`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not upload photo");
        setStep("url");
      } finally {
        setUploadingPhotos(false);
        setUploadedFileName(null);
      }
      return;
    }

    // Vercel serverless body limit on the parse-file endpoint is ~4.5 MB.
    // Anything larger will be rejected at the platform layer before our code
    // runs, so we cap the client-side check here too.
    const PARSE_FILE_MAX_MB = 4;
    if (file.size > PARSE_FILE_MAX_MB * 1024 * 1024) {
      return toast.error(
        `File is too large. Max ${PARSE_FILE_MAX_MB} MB for documents. ` +
        `For larger files, switch to Manual entry below.`,
      );
    }

    setUploadedFileName(file.name);
    setStep("parsing-file");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/parse-listing-file", {
        method: "POST",
        body: formData,
      });

      // Some platform errors (413, 502) return non-JSON bodies. Guard the parse.
      const text = await res.text();
      let data: { error?: string; listing?: ListingData; warning?: string } = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* non-JSON body */ }

      if (!res.ok) {
        throw new Error(
          data.error ||
          (res.status === 413 ? "File is too large for the document parser. Try Manual entry." :
           `Upload failed (${res.status})`),
        );
      }

      if (data.listing) setListing(coerceListing(data.listing));
      setManualMode(true);
      setStep("review");

      if (data.warning) {
        toast(data.warning, { icon: "ℹ️" });
      } else if (data.listing?.address) {
        toast.success(`Imported details from ${file.name}`);
      } else {
        toast(`Uploaded ${file.name}. Please fill in any missing fields`, { icon: "ℹ️" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read file");
      setStep("url");
      setUploadedFileName(null);
    }
  }

  // ── Listing photos (uploaded photos used as b-roll) ────────────────────────
  async function handlePhotosUpload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    const remaining = MAX_LISTING_PHOTOS - listing.photoUrls.length;
    if (remaining <= 0) {
      return toast.error(`Max ${MAX_LISTING_PHOTOS} photos. Remove one first.`);
    }
    const batch = list.slice(0, remaining);
    if (list.length > remaining) {
      toast(`Only the first ${remaining} photos will be used (max ${MAX_LISTING_PHOTOS}).`, { icon: "ℹ️" });
    }

    // Client-side validation — collect all bad files, don't abort on first
    const invalid: string[] = [];
    for (const f of batch) {
      if (!f.type.startsWith("image/")) invalid.push(`${f.name} is not an image`);
      else if (f.size > 15 * 1024 * 1024) invalid.push(`${f.name} exceeds 15 MB`);
    }
    if (invalid.length > 0) {
      return toast.error(invalid.join(" · "));
    }

    setUploadingPhotos(true);

    /**
     * The signed-in user, resolved once for the whole batch, then three
     * uploads at a time.
     *
     * Every file used to resolve it for itself and all of them ran at once,
     * which is what made them fight over the auth lock. Three at a time is
     * also kinder to a phone: these are the raw files, up to 15 MB each, with
     * no downscaling on this path.
     */
    let userId: string;
    try {
      userId = await currentUserId();
    } catch (err) {
      setUploadingPhotos(false);
      return toast.error(err instanceof Error ? err.message : "You must be signed in to upload photos");
    }

    const urls: string[] = [];
    const failures: string[] = [];
    const BATCH = 3;
    for (let i = 0; i < batch.length; i += BATCH) {
      const slice = batch.slice(i, i + BATCH);
      const results = await Promise.allSettled(slice.map((f) => uploadPhotoToStorage(f, userId)));
      results.forEach((r, j) => {
        if (r.status === "fulfilled") urls.push(r.value);
        else failures.push(`${slice[j].name}: ${r.reason instanceof Error ? r.reason.message : "upload failed"}`);
      });
    }

    if (urls.length > 0) {
      setListing((l) => ({ ...l, photoUrls: [...l.photoUrls, ...urls] }));
      toast.success(`Uploaded ${urls.length} photo${urls.length === 1 ? "" : "s"}`);
    }
    if (failures.length > 0) {
      toast.error(failures.length === 1 ? failures[0] : `${failures.length} photos failed to upload`);
    }

    setUploadingPhotos(false);
  }

  /**
   * Reorder, which this grid has never had.
   *
   * The tiles are numbered and the number is what the video uses, so the order
   * has always mattered and has always been whatever order the picker handed
   * the files over in. Left/right rather than up/down because this is a grid,
   * and the numbers read across it.
   */
  function movePhoto(from: number, to: number) {
    setListing((l) => {
      if (to < 0 || to >= l.photoUrls.length) return l;
      const next = [...l.photoUrls];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...l, photoUrls: next };
    });
  }

  function removePhoto(index: number) {
    setListing((l) => ({
      ...l,
      photoUrls: l.photoUrls.filter((_, i) => i !== index),
    }));
  }

  // ── Generate ───────────────────────────────────────────────────────────────
  /**
   * Both buttons write the same script; only what happens next differs.
   *
   * `record` asks for the script alone and hands it to the camera tab — no
   * project row, because a recording is not a render and an unused draft in
   * My Videos is just litter.
   */
  async function handleGenerate(record = false) {
    if (!listing.address.trim()) return toast.error("Address is required");
    if (!listing.price.trim()) return toast.error("Price is required");
    setStep("generating");
    try {
      const res = await fetch("/api/ai/listing-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing, videoLength, renderMode, unbranded,
          ...(record && { scriptOnly: true }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      if (record) {
        toast.success("Script ready. Set up your shot.");
        // Back to review before handing over: the parent switches tabs, which
        // unmounts this, but if that ever stops being true the form must not
        // be left sitting on a spinner that has nothing left to wait for.
        setStep("review");
        onRecordYourself?.(data.script as string, listing.photoUrls);
        return;
      }

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

        {/* ── Primary: Photo upload ── */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
            Listing Photos
          </label>

          {listing.photoUrls.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-2">
              {listing.photoUrls.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                  {/* Always visible, never hover-gated: opacity-0 with
                      group-hover means a phone can never reveal it, so these
                      photos could not be removed or reordered on the device
                      most of them are added from. */}
                  <button
                    type="button"
                    onClick={() => setListing((l) => ({ ...l, photoUrls: l.photoUrls.filter((_, j) => j !== i) }))}
                    className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 text-white rounded-full p-1.5"
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    <X size={12} />
                  </button>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">{i + 1}</span>
                  <div className="absolute inset-x-0 bottom-0 flex justify-between">
                    <button
                      type="button"
                      onClick={() => movePhoto(i, i - 1)}
                      disabled={i === 0}
                      className="flex h-8 w-8 items-center justify-center text-white disabled:opacity-20 enabled:active:text-spark-amber"
                      aria-label={`Move photo ${i + 1} earlier`}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePhoto(i, i + 1)}
                      disabled={i === listing.photoUrls.length - 1}
                      className="flex h-8 w-8 items-center justify-center text-white disabled:opacity-20 enabled:active:text-spark-amber"
                      aria-label={`Move photo ${i + 1} later`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {listing.photoUrls.length < MAX_LISTING_PHOTOS && (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhotos}
              className="flex flex-col items-center justify-center gap-2 w-full px-4 py-5 rounded-xl border-2 border-dashed border-spark-blue/25 bg-spark-blue/10 hover:bg-spark-blue/15 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {uploadingPhotos ? (
                <>
                  <Loader2 size={24} className="animate-spin text-spark-blue" />
                  <span className="text-sm font-semibold text-spark-blue">Uploading photos…</span>
                </>
              ) : (
                <>
                  <ImageIcon size={24} className="text-spark-blue" />
                  <span className="text-sm font-bold text-spark-ink">
                    {listing.photoUrls.length === 0
                      ? `Select up to ${MAX_LISTING_PHOTOS} photos at once`
                      : `Add more (${MAX_LISTING_PHOTOS - listing.photoUrls.length} slots left)`}
                  </span>
                  <span className="text-xs text-spark-blue text-center">
                    Hold <strong>Cmd</strong> (Mac) or <strong>Ctrl</strong> (Windows) to pick multiple · JPG, PNG, WEBP · max 15 MB each
                  </span>
                </>
              )}
            </button>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) handlePhotosUpload(files);
              if (photoInputRef.current) photoInputRef.current.value = "";
            }}
          />
        </div>

        {/* ── If photos uploaded, show Generate button ── */}
        {listing.photoUrls.length > 0 && (
          <Button
            onClick={handleManual}
            size="lg"
            className="w-full gap-2"
          >
            Next: Add Listing Details <ArrowRight size={16} />
          </Button>
        )}

        {/* ── Divider ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-300" />
          <span className="text-sm font-semibold text-slate-600">or import listing details</span>
          <div className="flex-1 h-px bg-slate-300" />
        </div>

        {/* ── URL import ── */}
        <div>
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
          {/* Shortened links do work and were not mentioned, so a slow one
              read as an unsupported one. They take longer because the
              redirect has to be followed before the real page is even
              fetched — worth saying, so a wait looks like a wait. */}
          <p className="text-xs text-slate-400 mt-1.5">
            Supported: Zillow · Realtor.com · Redfin · Homes.com · Trulia · Compass
            <br />
            Short links (myre.io, bit.ly) work too. They just take a few seconds longer.
          </p>
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all text-sm font-medium text-slate-600 hover:text-primary-600"
        >
          <Upload size={16} />
          <span className="flex-1 text-left">
            Upload file
            <span className="block text-xs text-slate-400 font-normal mt-0.5">
              PDF, MLS export, Word, CSV · up to 4 MB
            </span>
          </span>
          <ArrowRight size={14} className="text-slate-400" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileUpload(f);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />

        <button
          onClick={handleManual}
          className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all text-sm font-medium text-slate-600 hover:text-primary-600"
        >
          <PencilLine size={16} />
          Enter listing details manually
        </button>

        <div className="p-3 bg-spark-blue/10 border border-spark-blue/20 rounded-xl">
          <p className="text-xs text-spark-blue leading-relaxed">
            {/* Was "60–90 second", which stopped being true when listing
                scripts moved onto the same word budgets as every other script
                in the app. Read from RENDERED_SCRIPT_LENGTHS so it cannot go
                stale again the next time those change. */}
            <strong>What happens next:</strong> We import the listing details, then use AI to write
            a Fair Housing-compliant property tour voiceover script. Up to{" "}
            {ceilMinutesFor(RENDERED_SCRIPT_LENGTHS[0].words)} minutes, or{" "}
            {ceilMinutesFor(RENDERED_SCRIPT_LENGTHS[1].words)} if you pick Longform, plus the
            titles, hashtags and blog post that go with it. Takes about a minute.
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

  // ── Parsing uploaded file step ─────────────────────────────────────────────
  if (step === "parsing-file") {
    return (
      <div className="flex flex-col items-center py-12 gap-4 text-center">
        <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center">
          <FileText className="w-8 h-8 text-primary-500 animate-pulse" />
        </div>
        <div>
          <p className="font-semibold text-brand-text">Reading your file…</p>
          <p className="text-sm text-slate-400 mt-1 truncate max-w-xs">
            {uploadedFileName || "Extracting listing details"}
          </p>
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

      {/* Listing Photos.
          One block, not two branches. The add button and — worse — the file
          input itself used to live in the empty-state branch only, so an
          import that brought back photos removed the only way to add any: a
          scrape that found eleven left a twelfth slot that could not be
          filled, and a photo the scraper picked badly could be deleted but
          never replaced. */}
      <div>
        <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mb-1.5">
          <Camera size={12} /> Listing Photos
          <span className="text-slate-400 font-normal">
            {listing.photoUrls.length > 0
              ? `(${listing.photoUrls.length} of ${MAX_LISTING_PHOTOS} · used as b-roll)`
              : "(optional · used as b-roll)"}
          </span>
        </label>

        {listing.photoUrls.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-2">
            {listing.photoUrls.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100 group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 bg-black/70 hover:bg-red-500 text-white rounded-full p-1.5"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  <Trash2 size={12} />
                </button>
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">{i + 1}</span>
                <div className="absolute inset-x-0 bottom-0 flex justify-between">
                  <button
                    type="button"
                    onClick={() => movePhoto(i, i - 1)}
                    disabled={i === 0}
                    className="flex h-8 w-8 items-center justify-center text-white disabled:opacity-20 enabled:active:text-spark-amber"
                    aria-label={`Move photo ${i + 1} earlier`}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePhoto(i, i + 1)}
                    disabled={i === listing.photoUrls.length - 1}
                    className="flex h-8 w-8 items-center justify-center text-white disabled:opacity-20 enabled:active:text-spark-amber"
                    aria-label={`Move photo ${i + 1} later`}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {listing.photoUrls.length < MAX_LISTING_PHOTOS ? (
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={uploadingPhotos}
            className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 hover:border-spark-blue/25 hover:bg-spark-blue/10 transition-all text-sm font-medium text-slate-600 hover:text-spark-blue disabled:opacity-60"
          >
            {uploadingPhotos ? <Loader2 size={16} className="animate-spin text-spark-blue" /> : <ImageIcon size={16} />}
            {uploadingPhotos
              ? "Uploading…"
              : listing.photoUrls.length === 0
                ? `Add photos (up to ${MAX_LISTING_PHOTOS})`
                : `Add more photos (${MAX_LISTING_PHOTOS - listing.photoUrls.length} slot${
                    MAX_LISTING_PHOTOS - listing.photoUrls.length === 1 ? "" : "s"
                  } left)`}
          </button>
        ) : (
          // The render uses twelve. Saying so beats an add button that would
          // only refuse, and points at the way to make room.
          <p className="text-[11px] text-slate-400">
            All {MAX_LISTING_PHOTOS} slots full. That is what the video uses. Remove one to swap it out.
          </p>
        )}

        {/* Always mounted, whichever state the block is in. */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) handlePhotosUpload(files);
            if (photoInputRef.current) photoInputRef.current.value = "";
          }}
        />
      </div>

      {/* Fair Housing notice */}
      <div className="p-3 bg-spark-blue/10 border border-spark-blue/20 rounded-xl">
        <p className="text-xs text-spark-blue leading-relaxed">
          <strong>Fair Housing AI</strong>. Your script will be automatically reviewed to ensure compliance
          with the Fair Housing Act. We never include demographic, school, or community-composition language.
        </p>
      </div>

      {/* Who's on screen is deliberately NOT asked here.
          It was, and the setup screen asks it again — with three options there
          rather than two, because "I'll record it" is the third answer.
          Traced end to end, this copy earned nothing: renderMode only becomes
          ai_script.render_mode, the setup screen reads that back as its own
          default, and the setup screen's value is what create-blog renders
          from. It never reaches the script prompt. So it was a render setting
          asked before the script existed, and then asked again in the place
          that decides it.

          Script Length below stays for the opposite reason: it changes the
          script that gets WRITTEN, via targetWords and maxWords, and the setup
          screen has no length control. It is not a duplicate. */}

      {/* Script length. Same two the renderer supports and the same budgets
          the clamp enforces, so the tour is written to the length it will
          actually be spoken at. It used to be a fixed "under 200 words" —
          about 1:20, barely half the shortest video the app renders. */}
      <div>
        <p className="text-[11px] font-semibold text-spark-ink-muted mb-1">Script Length</p>
        <div className="grid grid-cols-2 gap-1.5">
          {RENDERED_SCRIPT_LENGTHS.map((l) => {
            const isLong = l.key === "rendered_long";
            const locked = isLong && !longAvailable;
            const value: VideoLength = isLong ? "long" : "standard";
            return (
              <button
                key={l.key}
                type="button"
                disabled={locked}
                onClick={() => setVideoLength(value)}
                aria-pressed={videoLength === value}
                title={locked ? "Long videos are a separate allowance. Add one in Billing" : undefined}
                className={`px-2 py-1.5 rounded-lg border text-center transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  videoLength === value && !locked
                    ? "border-spark-amber bg-spark-amber-tint"
                    : "border-spark-rule bg-white hover:border-spark-rule-dim disabled:hover:border-spark-rule"
                }`}
              >
                <span className="block text-[11px] font-bold text-brand-text">{l.label}</span>
                <span className="block text-[10px] text-spark-ink-muted">
                  {locked ? "needs a long video" : `up to ${ceilMinutesFor(l.words)} min`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sits with the script settings, not with the recorder: this changes
          the words that get written, and by the time there is a video to put
          overlays on it is too late to un-say "call me". */}
      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-spark-rule px-3 py-2.5">
        <input
          type="checkbox"
          checked={unbranded}
          onChange={(e) => setUnbranded(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-spark-amber"
        />
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-spark-ink">
            Unbranded script for the MLS
          </span>
          <span className="block text-[11px] leading-[1.45] text-spark-ink-faint">
            Writes the tour with no name, brokerage or closing ask. The property still gets its
            address, price and features. Tick the matching box on the recorder to leave the
            overlays off too. Check what your board requires; the rules vary.
          </span>
        </span>
      </label>

      {/* Named for what it does.
          It was "Generate My Listing Video", and it does not generate a
          video: handleGenerate() writes the script, creates the project and
          pushes to the editor — its own toast says "Listing script ready!".
          The video is rendered by Spark Video, two screens later, and that is
          the click that spends a credit. The line under these buttons had
          been quietly correcting the label from three inches away. */}
      <Button
        onClick={() => handleGenerate()}
        disabled={!listing.address.trim() || !listing.price.trim()}
        size="lg"
        className="w-full gap-2"
      >
        Write My Tour Script <ArrowRight size={16} />
      </Button>

      {/* Goes to the camera tab, not the editor's teleprompter: only the
          camera tab's recorder composites photos, and only there are they
          rehosted first, which canvas recording requires. */}
      <button
        type="button"
        onClick={() => handleGenerate(true)}
        disabled={!listing.address.trim() || !listing.price.trim()}
        className="flex w-full flex-col items-center justify-center rounded-xl border border-spark-ink px-5 py-2.5 text-[15px] font-semibold leading-[1.25] text-spark-ink transition-colors hover:bg-spark-ink hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-spark-ink"
      >
        Read it myself on camera
        {/* This one goes straight to the camera — handleGenerate(true) sends
            scriptOnly and hands the script and photos to the recorder. Saying
            so matters now that the button beside it stops at the script: the
            two look like a pair and they end in different places. */}
        <span className="mt-0.5 text-[12px] font-normal opacity-70">
          Straight to the teleprompter{listing.photoUrls.length > 0 ? ` · your ${listing.photoUrls.length} photos as b-roll` : ""} · free
        </span>
      </button>

      <p className="text-xs text-slate-400 text-center -mt-2">
        {/* True of both buttons, which the old wording was not: it said the
            camera choice came on the next screen, and the camera button goes
            there now. What the two share is that neither spends a credit. */}
        Both write the script first, and neither spends a credit. Recording it yourself stays free.
        Rendering it with your avatar costs one, at Spark Video on the setup screen, where you pick
        the avatar, shape and music.
      </p>
    </div>
  );
}
