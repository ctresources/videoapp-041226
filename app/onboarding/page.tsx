"use client";

/**
 * First run.
 *
 * This page was a stub that redirected to /create, which left onboarding_done
 * to be set by an unrelated save deep in Settings — the brand profile form.
 * Most people never opened it, so the flag stayed false forever and the
 * middleware's paid check, which sits behind it, never ran for anyone. Worse,
 * a render hard-fails without a HeyGen photo id, so a new user could pick a
 * topic, record a brief, choose a style, press Generate and only then be told
 * to go and upload a headshot.
 *
 * So the headshot step is the one thing that cannot be skipped: letting
 * someone past it does not spare them the wall, it just moves it to after
 * they have done the work. Everything else has a "Do this later".
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TalkingAvatarUploader, VoiceCloneUploader } from "@/components/settings/brand-profile";
import { FieldMic } from "@/components/ui/field-mic";
import { toStateAbbr } from "@/lib/utils/us-states";
import { Check, ArrowRight, Camera, MapPin, Mic } from "lucide-react";
import toast from "react-hot-toast";

type StepKey = "photo" | "market" | "voice";

const STEPS: { key: StepKey; label: string; icon: React.ElementType }[] = [
  { key: "photo", label: "Your photo", icon: Camera },
  { key: "market", label: "You and your market", icon: MapPin },
  { key: "voice", label: "Your voice", icon: Mic },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<StepKey>("photo");
  const [saving, setSaving] = useState(false);

  // Step 1
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Step 2
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  // Step 3
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [heygenVoiceId, setHeygenVoiceId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_done, full_name, location_city, location_state, phone, avatar_url, heygen_photo_id, voice_clone_id, heygen_voice_id")
        .eq("id", user.id)
        .single();
      const p = data as Record<string, string | boolean | null> | null;

      // Already done — nothing here to do, and coming back should not feel
      // like being sent round the loop again.
      if (p?.onboarding_done) { router.replace("/create"); return; }

      setFullName((p?.full_name as string) ?? "");
      setCity((p?.location_city as string) ?? "");
      setState((p?.location_state as string) ?? "");
      setPhone((p?.phone as string) ?? "");
      setAvatarUrl((p?.avatar_url as string) ?? null);
      setPhotoId((p?.heygen_photo_id as string) ?? null);
      setVoiceId((p?.voice_clone_id as string) ?? null);
      setHeygenVoiceId((p?.heygen_voice_id as string) ?? null);
      // Someone part-way through starts where they left off.
      if (p?.heygen_photo_id) setStep(p?.location_city ? "voice" : "market");
      setLoading(false);
    });
  }, [router]);

  /** Saves what has been filled in and hands over to Create. */
  const finish = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        location_city: city.trim() || null,
        location_state: state.trim() || null,
        phone: phone.trim() || null,
        // The flag this whole page exists to set honestly.
        onboarding_done: true,
      })
      .eq("id", userId);
    if (error) {
      toast.error("Could not save that — try again");
      setSaving(false);
      return;
    }
    if (!opts?.silent) toast.success("You're set up. Let's make a video.");
    router.replace("/create");
  }, [userId, fullName, city, state, phone, router]);

  async function saveMarketAndContinue() {
    setStep("voice");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-5 py-16">
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-spark-paper">
      <div className="mx-auto max-w-lg px-5 py-12 sm:py-16">
        <h1 className="font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em] text-spark-ink sm:text-[42px]">
          Let&apos;s set up{" "}
          <span className="bg-gradient-to-r from-spark-amber via-[#52665D] to-spark-blue bg-clip-text text-transparent">
            your studio
          </span>
        </h1>
        <p className="mt-2 text-[14.5px] leading-[1.5] text-spark-ink-muted">
          Three quick things, then every video you make carries your face, your market and your voice.
        </p>

        {/* Where you are. Numbered because this genuinely is a sequence. */}
        <div className="mt-7 flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s.key} className="flex flex-1 items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    done
                      ? "bg-spark-amber text-white"
                      : active
                        ? "border-[1.5px] border-spark-amber bg-white text-[#A3660F]"
                        : "border border-spark-rule bg-white text-spark-ink-faint"
                  }`}
                >
                  {done ? <Check size={13} /> : i + 1}
                </span>
                <span className={`hidden text-[12px] sm:block ${active ? "font-semibold text-spark-ink" : "text-spark-ink-faint"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-spark-rule" />}
              </div>
            );
          })}
        </div>

        <Card className="mt-6 p-5">
          {step === "photo" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-[17px] font-semibold text-spark-ink">Upload a headshot</h2>
                <p className="mt-1 text-[13px] leading-[1.5] text-spark-ink-muted">
                  This becomes your on-screen presenter. A clear, front-facing photo works best —
                  the same one you&apos;d use on a listing.
                </p>
              </div>
              {userId && (
                <TalkingAvatarUploader
                  userId={userId}
                  currentPhotoId={photoId}
                  currentAvatarUrl={avatarUrl}
                  onUpdate={(id, url) => { setPhotoId(id); setAvatarUrl(url); }}
                />
              )}
              {/* No skip here, and the reason is said out loud rather than
                  left as a greyed-out button people argue with. */}
              <p className="text-[12px] leading-[1.45] text-spark-ink-faint">
                This one is required — videos can&apos;t render without it.
              </p>
              <Button
                onClick={() => setStep("market")}
                disabled={!photoId}
                className="gap-1.5 self-start"
              >
                Continue <ArrowRight size={14} />
              </Button>
            </div>
          )}

          {step === "market" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-[17px] font-semibold text-spark-ink">Your name and market</h2>
                <p className="mt-1 text-[13px] leading-[1.5] text-spark-ink-muted">
                  These go on your closing card and your call to action. You can change the market
                  per video later.
                </p>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-spark-ink-muted">Your name</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  className="rounded-lg border border-spark-rule px-3 py-2 text-[13.5px] text-spark-ink outline-none focus:border-spark-amber"
                />
              </label>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-spark-ink-muted">Your market</span>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="City"
                      className="w-full rounded-lg border border-spark-rule py-2 pl-3 pr-9 text-[13.5px] text-spark-ink outline-none focus:border-spark-amber"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2">
                      <FieldMic onTranscript={(t) => setCity(t.replace(/[.,]\s*$/, "").trim())} title="Say the city" />
                    </span>
                  </div>
                  <input
                    value={state}
                    onChange={(e) => setState(toStateAbbr(e.target.value))}
                    placeholder="ST"
                    maxLength={2}
                    className="w-16 shrink-0 rounded-lg border border-spark-rule px-3 py-2 text-[13.5px] uppercase text-spark-ink outline-none focus:border-spark-amber"
                  />
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-spark-ink-muted">
                  Phone <span className="font-normal text-spark-ink-faint">· shown on the closing card</span>
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(215) 555-0142"
                  className="rounded-lg border border-spark-rule px-3 py-2 text-[13.5px] text-spark-ink outline-none focus:border-spark-amber"
                />
              </label>

              <div className="flex items-center gap-3">
                <Button onClick={saveMarketAndContinue} className="gap-1.5">
                  Continue <ArrowRight size={14} />
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("voice")}
                  className="text-[12.5px] font-medium text-spark-ink-muted underline underline-offset-2 hover:text-spark-ink"
                >
                  Do this later
                </button>
              </div>
            </div>
          )}

          {step === "voice" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-[17px] font-semibold text-spark-ink">Clone your voice</h2>
                <p className="mt-1 text-[13px] leading-[1.5] text-spark-ink-muted">
                  About thirty seconds of you talking, once. Every video from then on speaks in your
                  own voice — skip it and they use a stock voice instead.
                </p>
              </div>
              {userId && (
                <VoiceCloneUploader
                  userId={userId}
                  currentVoiceId={voiceId}
                  currentHeygenVoiceId={heygenVoiceId}
                  onUpdate={(eleven, heygen) => { setVoiceId(eleven); setHeygenVoiceId(heygen); }}
                />
              )}
              <div className="flex items-center gap-3">
                <Button onClick={() => finish()} loading={saving} className="gap-1.5">
                  {voiceId ? "Done — start creating" : "Start creating"} <ArrowRight size={14} />
                </Button>
                {!voiceId && (
                  <button
                    type="button"
                    onClick={() => finish()}
                    className="text-[12.5px] font-medium text-spark-ink-muted underline underline-offset-2 hover:text-spark-ink"
                  >
                    Use a stock voice for now
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>

        <p className="mt-4 text-center text-[12px] text-spark-ink-faint">
          Everything here can be changed later in Settings.
        </p>
      </div>
    </div>
  );
}
