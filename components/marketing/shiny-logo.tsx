"use client";

import { useRef } from "react";
import Image from "next/image";
import s from "./shiny-logo.module.css";

/**
 * The website logo with a shine that sweeps across it every few seconds, a
 * twinkling star, a lift on hover, and a burst of sparks on click (2026-10-26,
 * the owner's approved mockup). Still for visitors who ask for less motion.
 */
export function ShinyLogo({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  function burst() {
    const logo = ref.current;
    if (!logo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = logo.getBoundingClientRect();
    const cx = r.width * 0.06;
    const cy = r.height * 0.38;
    for (let i = 0; i < 12; i++) {
      const el = document.createElement("span");
      el.className = s.spark;
      const a = (Math.PI * 2 * i) / 12;
      const d = 18 + Math.random() * 26;
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.setProperty("--dx", `${Math.cos(a) * d}px`);
      el.style.setProperty("--dy", `${Math.sin(a) * d}px`);
      logo.appendChild(el);
      setTimeout(() => el.remove(), 900);
    }
  }

  return (
    <span ref={ref} className={`${s.logo} ${className ?? ""}`} onClick={burst}>
      <Image
        src="/sparkreels-logo-light.png"
        alt="SparkReels.ai — Speak. Spark. Share."
        width={200}
        height={40}
        className="h-auto w-full"
        unoptimized
        priority
      />
      <span className={s.shine} />
      <span className={s.star} />
    </span>
  );
}
