"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VoiceRecorder } from "@/components/voice/voice-recorder";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Mic, ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ fullName: "", company: "" });
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);

  async function handleStep1() {
    if (!profile.fullName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({
        full_name: profile.fullName.trim(),
        company_name: profile.company.trim() || null,
      }).eq("id", user.id);
    }
    setLoading(false);
    setStep(2);
  }

  async function handleStep2() {
    if (!voiceBlob) {
      toast.error("Please record a voice sample first");
      return;
    }
    setLoading(true);

    try {
      // Upload voice sample for ElevenLabs clone
      const formData = new FormData();
      formData.append("audio", voiceBlob, "voice-sample.webm");
      formData.append("title", "Voice Sample - Onboarding");
      formData.append("duration", String(voiceDuration));

      const res = await fetch("/api/voice/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      toast.success("Voice sample saved!");
      setStep(3);
    } catch {
      toast.error("Failed to save voice sample. You can set this up later in Settings.");
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  async function handleSkipToApp() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ onboarding_done: true }).eq("id", user.id);
    }
    router.push("/create");
    router.refresh();
  }

  const stepMeta = [
    { n: 1, label: "Your Profile" },
    { n: 2, label: "Voice Sample" },
    { n: 3, label: "First Video" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50/60 to-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif"
            alt="VoiceToVideos.AI"
            width={160}
            height={52}
            unoptimized
            priority
          />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-4 mb-8">
          {stepMeta.map(({ n, label }) => (
            <div key={n} className="flex flex-col items-center gap-1.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                step === n ? "bg-primary-500 text-white shadow-md" :
                step > n ? "bg-accent-500 text-white" : "bg-slate-200 text-slate-400"
              }`}>
                {step > n ? <CheckCircle size={16} /> : n}
              </div>
              <span className={`text-xs font-medium ${step === n ? "text-primary-500" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Step 1 — Profile */}
        {step === 1 && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-500" />
              </div>
              <div>
                <h2 className="font-bold text-brand-text">Welcome! Let&apos;s set up your profile</h2>
                <p className="text-xs text-slate-400">Takes less than 30 seconds</p>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <Input
                label="Your Full Name"
                placeholder="Jane Smith"
                value={profile.fullName}
                onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                autoFocus
              />
              <Input
                label="Company / Brokerage (optional)"
                placeholder="Smith Realty Group"
                value={profile.company}
                onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
              />
            </div>
            <Button onClick={handleStep1} loading={loading} size="lg" className="w-full mt-6 gap-2">
              Continue <ArrowRight size={16} />
            </Button>
          </Card>
        )}

        {/* Step 2 — Voice Sample */}
        {step === 2 && (
          <Card>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                <Mic className="w-5 h-5 text-secondary-500" />
              </div>
              <div>
                <h2 className="font-bold text-brand-text">Record your voice sample</h2>
                <p className="text-xs text-slate-400">30 seconds · Used to clone your voice for videos</p>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-5 bg-slate-50 rounded-xl p-3">
              Speak naturally for 30 seconds — introduce yourself, talk about a listing, or describe your local market. Our AI will learn your voice.
            </p>
            <VoiceRecorder
              onRecordingComplete={(blob, duration) => {
                setVoiceBlob(blob);
                setVoiceDuration(duration);
              }}
              maxSeconds={120}
            />
            <div className="flex gap-3 mt-6">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setStep(3)}
                className="flex-1 text-slate-400"
              >
                Skip for now
              </Button>
              <Button
                onClick={handleStep2}
                loading={loading}
                disabled={!voiceBlob}
                size="md"
                className="flex-2 gap-2 flex-1"
              >
                Save & Continue <ArrowRight size={15} />
              </Button>
            </div>
          </Card>
        )}

        {/* Step 3 — First video CTA */}
        {step === 3 && (
          <Card className="text-center">
            <div className="w-16 h-16 bg-accent-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-accent-500" />
            </div>
            <h2 className="text-xl font-bold text-brand-text mb-2">You&apos;re all set!</h2>
            <p className="text-slate-500 text-sm mb-6">
              Time to create your first video. Record 1-2 minutes about a listing, market update, or real estate tip — and watch the magic happen.
            </p>
            <Button onClick={handleSkipToApp} loading={loading} size="lg" className="w-full gap-2">
              <Mic size={18} /> Create My First Video
            </Button>
            <button
              onClick={handleSkipToApp}
              className="text-xs text-slate-400 mt-4 hover:text-slate-600 transition-colors"
            >
              Go to dashboard instead →
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
