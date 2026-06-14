"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { createClient } from "@/lib/supabase/client";
import {
  CheckCircle, Mic, ArrowRight, Sparkles, Camera, Upload,
  Phone, Globe, FileText, MapPin, ImageIcon, User,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

type Step = 1 | 2 | 3 | 4;

const INPUT_CLS = "w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500";
const LABEL_CLS = "block text-xs font-medium text-slate-500 mb-1.5";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Step 1 — contact fields
  const [fields, setFields] = useState({
    full_name: "", company_name: "", phone: "", company_phone: "",
    company_address: "", website: "", license_number: "",
  });

  // Step 2 — headshot (contact info display)
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [uploadingHeadshot, setUploadingHeadshot] = useState(false);
  const headshotInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — AI photo (talking avatar)
  const [aiPhotoPreview, setAiPhotoPreview] = useState<string | null>(null);
  const [uploadingAiPhoto, setUploadingAiPhoto] = useState(false);
  const aiPhotoInputRef = useRef<HTMLInputElement>(null);

  // Step 2 — logo
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — voice
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);

  function setField(key: string, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────
  async function handleStep1() {
    if (!fields.full_name.trim()) { toast.error("Please enter your name"); return; }
    if (!agreedToTerms) { toast.error("Please agree to the Terms of Service and Privacy Policy"); return; }
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({
        full_name:       fields.full_name.trim()       || null,
        company_name:    fields.company_name.trim()    || null,
        phone:           fields.phone.trim()           || null,
        company_phone:   fields.company_phone.trim()   || null,
        company_address: fields.company_address.trim() || null,
        website:         fields.website.trim()         || null,
        license_number:  fields.license_number.trim()  || null,
      }).eq("id", user.id);
    }
    setLoading(false);
    setStep(2);
  }

  // ── Step 2 — Headshot (contact info only, no AI registration) ────────────
  async function handleHeadshotFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    setUploadingHeadshot(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingHeadshot(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/headshot.${ext}?t=${Date.now()}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploadingHeadshot(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
    await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    setHeadshotPreview(publicUrl);
    toast.success("Headshot saved!");
    setUploadingHeadshot(false);
  }

  // ── Step 2 — AI Photo (for talking avatar) ────────────────────────────────
  async function handleAiPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }

    setUploadingAiPhoto(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingAiPhoto(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/ai-photo.${ext}?t=${Date.now()}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(filePath, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploadingAiPhoto(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setAiPhotoPreview(publicUrl);

    try {
      const res = await fetch("/api/profile/heygen-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("AI photo saved!");
    } catch {
      toast.success("Photo saved! AI avatar will activate on your first video.");
    }
    setUploadingAiPhoto(false);
  }

  // ── Step 2 — Logo ─────────────────────────────────────────────────────────
  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Logo must be under 5MB"); return; }

    setUploadingLogo(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingLogo(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/logo.${ext}?t=${Date.now()}`;
    const { error: upErr } = await supabase.storage.from("assets").upload(filePath, file, { upsert: true });
    if (upErr) { toast.error(upErr.message); setUploadingLogo(false); return; }

    const { data: { publicUrl } } = supabase.storage.from("assets").getPublicUrl(filePath);
    await supabase.from("profiles").update({ logo_url: publicUrl }).eq("id", user.id);
    setLogoPreview(publicUrl);
    toast.success("Logo saved!");
    setUploadingLogo(false);
  }

  // ── Step 3 — Voice ────────────────────────────────────────────────────────
  async function handleStep3() {
    if (!voiceBlob) { toast.error("Please record a voice sample first"); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", voiceBlob, "voice-sample.webm");
      formData.append("title", "Voice Sample - Onboarding");
      formData.append("duration", String(voiceDuration));
      const res = await fetch("/api/voice/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Voice sample saved!");
      setStep(4);
    } catch {
      toast.error("Failed to save voice sample. You can set this up later in Settings.");
      setStep(4);
    } finally {
      setLoading(false);
    }
  }

  // ── Finish ────────────────────────────────────────────────────────────────
  async function handleFinish() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("id", user.id);
    }
    router.push("/billing");
    router.refresh();
  }

  const anyUploading = uploadingHeadshot || uploadingAiPhoto || uploadingLogo;

  const stepMeta = [
    { n: 1, label: "Profile" },
    { n: 2, label: "Photos" },
    { n: 3, label: "Voice" },
    { n: 4, label: "Choose Plan" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50/60 to-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-8">
          <Image src="/logo_navbar_transparent.png" alt="SparkReels" width={160} height={52} unoptimized priority />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-4 mb-8">
          {stepMeta.map(({ n, label }) => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step === n ? "bg-primary-500 text-white shadow-md" :
                step > n  ? "bg-accent-500 text-white" : "bg-slate-200 text-slate-400"
              }`}>
                {step > n ? <CheckCircle size={16} /> : n}
              </div>
              <span className={`text-xs font-medium ${step === n ? "text-primary-500" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ── Step 1 — Profile & Contact ───────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <h2 className="font-bold text-brand-text">Welcome! Let&apos;s set up your profile</h2>
                <p className="text-xs text-slate-400">Takes about 2 minutes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Full Name <span className="text-red-400">*</span></label>
                <input type="text" className={INPUT_CLS} placeholder="Jane Smith"
                  value={fields.full_name} onChange={(e) => setField("full_name", e.target.value)} autoFocus />
              </div>
              <div>
                <label className={LABEL_CLS}>Company / Brokerage</label>
                <input type="text" className={INPUT_CLS} placeholder="Smith Realty Group"
                  value={fields.company_name} onChange={(e) => setField("company_name", e.target.value)} />
              </div>
              <div>
                <label className={`${LABEL_CLS} flex items-center gap-1`}><Phone size={11} /> Mobile Phone</label>
                <input type="tel" className={INPUT_CLS} placeholder="+1 (555) 000-0000"
                  value={fields.phone} onChange={(e) => setField("phone", e.target.value)} />
              </div>
              <div>
                <label className={`${LABEL_CLS} flex items-center gap-1`}><Phone size={11} /> Company Phone <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="tel" className={INPUT_CLS} placeholder="+1 (555) 000-0000"
                  value={fields.company_phone} onChange={(e) => setField("company_phone", e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={`${LABEL_CLS} flex items-center gap-1`}><MapPin size={11} /> Company Address <span className="text-slate-400 font-normal">(optional)</span></label>
                <input type="text" className={INPUT_CLS} placeholder="123 Main St, Austin, TX 78701"
                  value={fields.company_address} onChange={(e) => setField("company_address", e.target.value)} />
              </div>
              <div>
                <label className={`${LABEL_CLS} flex items-center gap-1`}><Globe size={11} /> Website</label>
                <input type="url" className={INPUT_CLS} placeholder="https://youragentwebsite.com"
                  value={fields.website} onChange={(e) => setField("website", e.target.value)} />
              </div>
              <div>
                <label className={`${LABEL_CLS} flex items-center gap-1`}><FileText size={11} /> RE License Number</label>
                <input type="text" className={INPUT_CLS} placeholder="DRE #01234567"
                  value={fields.license_number} onChange={(e) => setField("license_number", e.target.value)} />
              </div>
            </div>

            <label className="flex items-start gap-3 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-blue-500 cursor-pointer"
              />
              <span className="text-sm text-slate-500 leading-snug">
                I agree to the{" "}
                <a href="/terms" target="_blank" className="text-blue-500 hover:underline">Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" target="_blank" className="text-blue-500 hover:underline">Privacy Policy</a>
              </span>
            </label>

            <Button onClick={handleStep1} loading={loading} size="lg" className="w-full mt-4 gap-2">
              Continue <ArrowRight size={16} />
            </Button>
          </Card>
        )}

        {/* ── Step 2 — Photos ──────────────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Camera className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h2 className="font-bold text-brand-text">Upload your photos</h2>
                <p className="text-xs text-slate-400">All optional — you can add or update these in Settings anytime</p>
              </div>
            </div>

            {/* Headshot */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Your Headshot
              </p>
              <p className="text-xs text-slate-400 mb-3">Displayed alongside your contact info on videos</p>
              <input ref={headshotInputRef} type="file" accept="image/*" className="hidden" onChange={handleHeadshotFile} />
              {headshotPreview ? (
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-4 border-primary-200 shadow shrink-0">
                    <Image src={headshotPreview} alt="Headshot" fill className="object-cover" unoptimized />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Headshot saved ✓</p>
                    <button onClick={() => headshotInputRef.current?.click()}
                      className="text-xs text-blue-500 hover:underline mt-1">Change photo</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => headshotInputRef.current?.click()} disabled={uploadingHeadshot}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-primary-300 hover:bg-primary-50/30 transition-colors disabled:opacity-50">
                  <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                    {uploadingHeadshot ? (
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <User className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-600">
                      {uploadingHeadshot ? "Uploading…" : "Upload headshot"}
                    </p>
                    <p className="text-xs text-slate-400">JPG, PNG, WEBP · Max 10MB</p>
                  </div>
                </button>
              )}
            </div>

            {/* AI Photo */}
            <div className="mb-5 border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                AI Avatar Photo
              </p>
              <p className="text-xs text-slate-400 mb-3">Used to generate your AI talking avatar in videos — clear, front-facing photo works best</p>
              <input ref={aiPhotoInputRef} type="file" accept="image/*" className="hidden" onChange={handleAiPhotoFile} />
              {aiPhotoPreview ? (
                <div className="flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl overflow-hidden border-4 border-blue-100 shadow shrink-0">
                    <Image src={aiPhotoPreview} alt="AI Photo" fill className="object-cover" unoptimized />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">AI photo saved ✓</p>
                    <button onClick={() => aiPhotoInputRef.current?.click()}
                      className="text-xs text-blue-500 hover:underline mt-1">Change photo</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => aiPhotoInputRef.current?.click()} disabled={uploadingAiPhoto}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors disabled:opacity-50">
                  <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    {uploadingAiPhoto ? (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-600">
                      {uploadingAiPhoto ? "Uploading…" : "Upload AI avatar photo"}
                    </p>
                    <p className="text-xs text-slate-400">JPG, PNG, WEBP · Max 10MB</p>
                  </div>
                </button>
              )}
            </div>

            {/* Logo */}
            <div className="border-t border-slate-100 pt-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Brokerage Logo
              </p>
              <p className="text-xs text-slate-400 mb-3">Appears as a watermark on your videos</p>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
              {logoPreview ? (
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shrink-0">
                    <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Logo saved ✓</p>
                    <button onClick={() => logoInputRef.current?.click()}
                      className="text-xs text-blue-500 hover:underline mt-1">Change logo</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                  className="w-full border-2 border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-primary-300 hover:bg-primary-50/30 transition-colors disabled:opacity-50">
                  <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                    {uploadingLogo ? (
                      <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-600">
                      {uploadingLogo ? "Uploading…" : "Upload brokerage logo"}
                    </p>
                    <p className="text-xs text-slate-400">PNG with transparent background recommended · Max 5MB</p>
                  </div>
                </button>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" size="md" onClick={() => setStep(3)}
                className="flex-1 text-slate-400" disabled={anyUploading}>
                Skip for now
              </Button>
              <Button onClick={() => setStep(3)} size="md"
                loading={anyUploading}
                disabled={anyUploading}
                className="flex-1 gap-2">
                Continue <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 3 — Voice ───────────────────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                <Mic className="w-5 h-5 text-secondary-500" />
              </div>
              <div>
                <h2 className="font-bold text-brand-text">Record your voice sample</h2>
                <p className="text-xs text-slate-400">Optional · Used to generate your AI voice in videos</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-5 bg-slate-50 rounded-xl p-3">
              Speak naturally for 30 seconds — introduce yourself, talk about a listing, or describe your local market. Our AI will learn your voice and use it in every video you create.
            </p>
            <VoiceRecorder
              onRecordingComplete={(blob, duration) => { setVoiceBlob(blob); setVoiceDuration(duration); }}
              maxSeconds={120}
            />
            <div className="flex gap-3 mt-6">
              <Button variant="ghost" size="md" onClick={() => setStep(4)} className="flex-1 text-slate-400">
                Skip for now
              </Button>
              <Button onClick={handleStep3} loading={loading} disabled={!voiceBlob} size="md" className="flex-1 gap-2">
                Save & Continue <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step 4 — Done ────────────────────────────────────────────────── */}
        {step === 4 && (
          <Card className="text-center">
            <div className="w-16 h-16 bg-accent-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-accent-500" />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">You&apos;re all set!</h2>
            <p className="text-slate-500 text-sm mb-6">
              Choose your plan to start creating AI-powered real estate videos.
            </p>
            <Button onClick={handleFinish} loading={loading} size="lg" className="w-full gap-2">
              Choose My Plan <ArrowRight size={18} />
            </Button>
            <button onClick={handleFinish}
              className="text-xs text-slate-400 mt-4 hover:text-slate-600 transition-colors block w-full">
              View plans & pricing →
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
