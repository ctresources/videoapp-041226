"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, Mic, Play, Volume2, VolumeX, X } from "lucide-react";
import s from "./hero.module.css";

/**
 * The home page hero (2026-10-26, the owner's approved mockup): the headline
 * on the left, and on the right a card that plays Speak → Spark → Share by
 * itself, with the real demo video in the Share step. Visitors can click a
 * step, the mic, or Watch the demo for the full video with sound.
 */

/** The demo video (the owner's pick, 2026-10-26): Avatar in circle, 16:9, fast start. */
export const HERO_VIDEO_URL =
  "https://fifryrqhrfnzbwpvvvkz.supabase.co/storage/v1/object/public/videos/0eeae470-2851-4578-95d1-7b0be1c3e0f6/32ae9e92-9999-4644-ac83-91951d3353c7.mp4";
const HERO_POSTER = "/hero/demo-poster.jpg";

const STEP_MS = 4500;
const SHARE_MS = 9000;
const SAID = "Hey SparkReels, make a 60-second video about the Maplewood market this month…";
const CAPTION = ["Homes in", "Maplewood", "are selling", "faster", "this month"];
const ROTOR = ["Visible.", "Trusted.", "Found.", "Booked."];
const CHIPS: { label: string; x: number; y: number }[] = [
  { label: "▶ YouTube", x: -150, y: -128 },
  { label: "◎ Instagram", x: 150, y: -128 },
  { label: "f Facebook", x: -160, y: 128 },
  { label: "G Google", x: 150, y: 128 },
];

export function Hero() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(0);
  const [cap, setCap] = useState("");
  const [word, setWord] = useState(0);
  const [muted, setMuted] = useState(true);
  const [open, setOpen] = useState(false);
  const [tilt, setTilt] = useState("");
  const [run, setRun] = useState(0);
  const vid = useRef<HTMLVideoElement>(null);

  const go = useCallback((n: number) => { setStep(n); setRun((r) => r + 1); }, []);

  // Advance by itself; the Share step stays longer so the video is seen.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => go((step + 1) % 3), step === 2 ? SHARE_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [step, run, open, go]);

  // What each step animates.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (step === 0) {
      setTyped("");
      for (let i = 1; i <= SAID.length; i++) timers.push(setTimeout(() => setTyped(SAID.slice(0, i)), i * 38));
    }
    if (step === 1) {
      setDone(0);
      setCap("");
      for (let i = 1; i <= 4; i++) timers.push(setTimeout(() => setDone(i), 350 + (i - 1) * 700));
      CAPTION.forEach((_, i) => timers.push(setTimeout(() => setCap(CAPTION.slice(Math.max(0, i - 1), i + 1).join(" ")), 400 + i * 650)));
    }
    const v = vid.current;
    if (v) {
      if (step === 2) { v.currentTime = 0; void v.play().catch(() => {}); }
      else v.pause();
    }
    return () => timers.forEach(clearTimeout);
  }, [step, run]);

  useEffect(() => {
    const t = setInterval(() => setWord((w) => (w + 1) % ROTOR.length), 2600);
    return () => clearInterval(t);
  }, []);

  // React sets muted as a property only; set it here so muted autoplay works on iPhone.
  useEffect(() => {
    if (vid.current) vid.current.muted = muted;
  }, [muted]);

  return (
    <section className={`${s.hero} pt-28 pb-16 px-4 sm:px-6 border-b border-slate-200`}>
      <div className={`${s.glow} ${s.glowA}`} />
      <div className={`${s.glow} ${s.glowB}`} />
      <div className="relative max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div>
          <p className="text-xl sm:text-2xl font-black text-blue-900 tracking-wide mb-4">
            Speak, Spark, Share — <span className="text-slate-400 font-bold">no filming, no editing, no glam required.</span>
          </p>
          <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] mb-5 text-slate-900">
            Hit the Mic. Be <span key={word} className={s.rotor}>{ROTOR[word]}</span>
            <span className="block text-blue-900 mt-1">Become the go-to local expert in your town.</span>
          </h1>
          <p className="text-xl text-slate-500 mb-5 leading-relaxed max-w-xl">
            Most real estate agents are invisible online. SparkReels.ai fixes that — turning one
            voice recording into a publish-ready video. A 60-second reel for social, or a full
            8-minute market update built to rank on YouTube.
          </p>
          <div className="flex items-start gap-3 border-l-4 border-amber-400 pl-4 mb-7">
            <p className="text-xl sm:text-2xl text-slate-600 leading-snug text-pretty">
              Agents who post video grow revenue <span className="font-black text-slate-900">49% faster</span> —
              yet only <span className="font-black text-slate-900">8%</span> do it consistently.{" "}
              <a href="#pain" className="font-black text-blue-900 underline decoration-2 underline-offset-2 hover:text-blue-700">Why?</a>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <a href="/beta" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-900 text-white text-xl font-semibold px-7 py-4 shadow-[0_10px_24px_-10px_rgba(30,58,138,0.7)] hover:-translate-y-0.5 hover:bg-blue-800 transition">
              Sign up for free <ArrowRight size={18} />
            </a>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white text-slate-800 text-xl font-semibold px-7 py-4 hover:border-slate-400 hover:bg-slate-50 transition-colors">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-500 text-white"><Play size={14} fill="currentColor" /></span>
              Watch the demo
            </button>
          </div>
          <a href="/beta" className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-base font-bold px-4 py-2 rounded-full mt-5 hover:bg-emerald-100 transition-colors">
            <span className={s.badgeDot} />
            First 100 agents get 1 free AI video — no credit card
          </a>
          <p className="mt-6 text-xl font-semibold text-slate-400 tracking-wide">
            Visibility <span className="text-slate-300">→</span> Credibility <span className="text-slate-300">→</span> Trust <span className="text-slate-300">→</span> Business
          </p>
          <p className="mt-2 text-base text-slate-400">No camera needed · Fair Housing compliant · Cancel anytime</p>
        </div>

        <div
          className={s.stage}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            setTilt(`rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`);
          }}
          onMouseLeave={() => setTilt("")}
        >
          <div className={`${s.float} ${s.f1}`}>🎤 <b className="text-blue-900">“Make a video about Maplewood”</b></div>
          <div className={`${s.float} ${s.f2}`}>✓ <b className="text-blue-900">Posted</b> to 4 accounts</div>
          <div className={s.card} style={{ transform: tilt, "--step": `${step === 2 ? SHARE_MS : STEP_MS}ms` } as CSSProperties}>
            <div className="grid grid-cols-3 gap-2">
              {["Speak", "Spark", "Share"].map((label, i) => (
                <button key={label} type="button" onClick={() => go(i)} className={`${s.tab} ${step === i ? s.tabOn : ""}`}>
                  <small>Step {i + 1}</small>{label}
                  <span key={step === i ? run : -1} className={s.bar} />
                </button>
              ))}
            </div>

            <div className={s.screen}>
              {/* Speak */}
              <div className={`${s.scene} ${step === 0 ? s.sceneOn : ""}`}>
                <button type="button" className={s.mic} onClick={() => go(0)} aria-label="Play the demo again">
                  <span className={s.ring} /><span className={`${s.ring} ${s.ring2}`} /><span className={`${s.ring} ${s.ring3}`} />
                  <Mic size={42} color="#fff" />
                </button>
                <div className={s.wave}>
                  {Array.from({ length: 22 }, (_, k) => <span key={k} style={{ animationDelay: `${(k * 0.07) % 1}s` }} />)}
                </div>
                <div className={s.said}>{typed}<span className={s.cursor} /></div>
              </div>

              {/* Spark */}
              <div className={`${s.scene} ${step === 1 ? s.sceneOn : ""}`}>
                <div className="grid h-full grid-cols-[1fr_105px] gap-3 sm:grid-cols-[1fr_150px] sm:gap-4">
                  <div className="flex flex-col gap-2.5">
                    {["Writing your script", "Finding local b-roll", "Your avatar and voice", "Captions and music"].map((t, i) => (
                      <div key={t} className={`${s.step} ${done > i ? s.stepDone : ""}`}><span className={s.dot}>✓</span>{t}</div>
                    ))}
                    <div className="mt-1 rounded-xl bg-white/95 p-3 text-[13px] text-slate-900">
                      <strong>Maplewood market, this month</strong>
                      <div className={s.shimmer} style={{ width: "92%" }} />
                      <div className={s.shimmer} style={{ width: "78%" }} />
                      <div className={s.shimmer} style={{ width: "85%" }} />
                    </div>
                  </div>
                  <div className={s.phone}><div className={s.pan} /><div className={s.cap}>{cap}</div></div>
                </div>
              </div>

              {/* Share, with the real video */}
              <div className={`${s.scene} ${step === 2 ? s.sceneOn : ""} grid place-items-center`}>
                <div className={s.vid}>
                  <video
                    ref={vid}
                    src={HERO_VIDEO_URL}
                    poster={HERO_POSTER}
                    muted={muted}
                    loop
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setMuted((m) => !m)}
                    className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white"
                  >
                    {muted ? <><VolumeX size={13} /> Sound</> : <><Volume2 size={13} /> Mute</>}
                  </button>
                </div>
                {CHIPS.map((c, i) => (
                  <div key={`${c.label}-${run}`} className={s.chip} style={{ "--x": `${c.x}px`, "--y": `${c.y}px`, animationDelay: `${0.1 + i * 0.15}s` } as CSSProperties}>
                    {c.label} <span className="text-green-600">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute -top-11 right-0 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
              <X size={20} />
            </button>
            <video src={HERO_VIDEO_URL} poster={HERO_POSTER} controls autoPlay playsInline className="w-full rounded-xl bg-black" />
          </div>
        </div>
      )}
    </section>
  );
}
