import { strToU8, zipSync } from "fflate";
import type { createAdminClient } from "@/lib/supabase/admin";
import { layout, SIZE, type DesignId, type Shape } from "@/lib/templates/designs";

/**
 * Animated words for video templates (2026-11-03, the owner's pick after the
 * Just Listed test): the same drawn words as the still version
 * (lib/templates/designs.ts), each piece moved in by a GSAP timeline, and
 * rendered see-through by HeyGen HyperFrames (about $0.10 a minute at 1080p).
 * The words are written into the page itself, so nothing depends on
 * HyperFrames' variables. If anything here fails, the video gets the still
 * words instead.
 */
type Admin = ReturnType<typeof createAdminClient>;
const GSAP = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";

/** The motion for each design: [group id, from-values, start time, duration, ease]. */
type Step = [string, Record<string, unknown>, number, number?, string?];
function steps(id: DesignId, v: boolean): Step[] {
  const rise = { y: 28, opacity: 0 };
  const contactIn: Record<string, unknown> = v ? { y: 18, opacity: 0 } : { x: 36, opacity: 0 };
  switch (id) {
    case "just_listed": return [
      ["fade", { opacity: 0 }, 0.1, 0.8],
      ["label", { x: -70, opacity: 0 }, 0.2, 0.7, "back.out(1.6)"],
      ["addr", rise, 0.9, 0.7, "power3.out"],
      ["price", { scale: 0.6, opacity: 0, transformOrigin: v ? "50% 50%" : "0% 50%" }, 1.4, 0.6, "back.out(2.2)"],
      ["details", { y: 16, opacity: 0 }, 1.9, 0.6],
      ["contact", contactIn, 2.2, 0.7, "power2.out"],
    ];
    case "luxury": return [
      ["bartop", { y: -140 }, 0, 0.9, "power3.out"],
      ["barbot", { y: 140 }, 0, 0.9, "power3.out"],
      ["band", { opacity: 0 }, 0.2, 1.0],
      ["kicker", { y: -10, opacity: 0 }, 0.6, 0.8],
      ["addr", { y: 20, opacity: 0 }, 0.9, 1.1, "power2.out"],
      ["price", { opacity: 0 }, 1.6, 1.0],
      ["details", { opacity: 0 }, 2.0, 0.8],
      ["contact", { opacity: 0 }, 2.3, 0.8],
    ];
    case "market_update": return [
      ["panel", v ? { y: -160, opacity: 0 } : { x: -220, opacity: 0 }, 0, 0.8, "power3.out"],
      ["kicker", { opacity: 0 }, 0.4, 0.6],
      ["title", rise, 0.6, 0.7, "power3.out"],
      ["stat0", { scale: 0.8, opacity: 0, transformOrigin: "50% 50%" }, 1.0, 0.5, "back.out(2)"],
      ["stat1", { scale: 0.8, opacity: 0, transformOrigin: "50% 50%" }, 1.25, 0.5, "back.out(2)"],
      ["stat2", { scale: 0.8, opacity: 0, transformOrigin: "50% 50%" }, 1.5, 0.5, "back.out(2)"],
      ["foot", { opacity: 0 }, 1.8, 0.6],
      ["contact", contactIn, 2.0, 0.7],
    ];
    case "neighborhood": return [
      ["fade", { opacity: 0 }, 0, 0.8],
      ["top", { opacity: 0 }, 0, 0.8],
      ["kicker", { x: -60, opacity: 0 }, 0.3, 0.6, "back.out(1.6)"],
      ["name", { y: 60, opacity: 0 }, 0.7, 0.8, "power3.out"],
      ["chip0", { scale: 0.7, opacity: 0, transformOrigin: "50% 50%" }, 1.3, 0.45, "back.out(2)"],
      ["chip1", { scale: 0.7, opacity: 0, transformOrigin: "50% 50%" }, 1.5, 0.45, "back.out(2)"],
      ["chip2", { scale: 0.7, opacity: 0, transformOrigin: "50% 50%" }, 1.7, 0.45, "back.out(2)"],
      ["contact", { opacity: 0 }, 1.9, 0.7],
    ];
    default: return [
      ["kicker", { y: -10, opacity: 0 }, 0.5, 0.6],
      ["name", rise, 0.8, 0.7, "power3.out"],
      ["role", { opacity: 0 }, 1.2, 0.6],
      ["phones", { y: 14, opacity: 0 }, 1.5, 0.6],
      ["website", { y: 14, opacity: 0 }, 1.7, 0.6],
      ["logo", { opacity: 0, scale: 0.9, transformOrigin: "50% 50%" }, 2.0, 0.7],
    ];
  }
}

/** The HyperFrames project (a zip with one page) for one video's words. */
export function animatedProject(o: {
  design: DesignId; shape: Shape; fields: Record<string, string>; accent: string; seconds: number;
  /** Agent Introduction's logo, as a PNG. */
  logo?: Buffer | null;
}): Uint8Array {
  const { w: W, h: H } = SIZE[o.shape];
  const v = o.shape === "vertical";
  const PW = v ? 1080 : 1920, PH = v ? 1920 : 1080;
  const T = Math.max(2, Math.round(o.seconds * 100) / 100);
  let { svg } = layout(o.design, o.shape, o.fields, o.accent);
  // The logo goes in the page itself (same place as the still version).
  if (o.design === "agent_intro" && o.logo) {
    const lw = Math.round(v ? W * 0.32 : W * 0.14), lh = Math.round(lw * 0.5);
    const x = v ? Math.round((W - lw) / 2) : Math.round(W - W * 0.04 - lw);
    const y = v ? Math.round(H * 0.9) : Math.round(H * 0.06);
    const img = `<g id="logo"><image href="data:image/png;base64,${o.logo.toString("base64")}" x="${x}" y="${y}" width="${lw}" height="${lh}" preserveAspectRatio="${v ? "xMidYMin" : "xMaxYMin"} meet"/></g>`;
    svg = svg.replace(/<\/svg>$/, `${img}</svg>`);
  }
  // Drawn at the render's full size; the words are shapes, so they stay sharp.
  svg = svg.replace(`width="${W}" height="${H}"`, `width="${PW}" height="${PH}"`);
  const motion = JSON.stringify(steps(o.design, v));
  const pulse = o.design === "just_listed" || o.design === "luxury" ? Math.max(4, T / 2) : null;
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;width:${PW}px;height:${PH}px;overflow:hidden}#stage{position:relative;width:${PW}px;height:${PH}px}svg{display:block}</style>
</head><body>
<div id="stage" data-composition-id="words" data-start="0" data-duration="${T}" data-width="${PW}" data-height="${PH}">
<div id="layer" class="clip" data-start="0" data-duration="${T}" data-track-index="0" style="position:absolute;inset:0">${svg}</div>
</div>
<script src="${GSAP}"></script>
<script>
  const tl = gsap.timeline({ paused: true });
  for (const [id, from, at, dur, ease] of ${motion}) {
    const el = document.getElementById(id);
    if (el) tl.from(el, Object.assign({ duration: dur || 0.6, ease: ease || "power2.out" }, from), at);
  }
  const ring = document.getElementById("ring");
  if (ring) {
    const c = 2 * Math.PI * Number(ring.getAttribute("r"));
    tl.fromTo(ring, { strokeDasharray: c, strokeDashoffset: c }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.out" }, 0.3);
  }
  ${pulse ? `const price = document.getElementById("price");
  if (price) tl.to(price, { scale: 1.06, transformOrigin: "50% 50%", duration: 0.35, yoyo: true, repeat: 1, ease: "sine.inOut" }, ${pulse.toFixed(2)});` : ""}
  tl.to({}, { duration: 0.01 }, ${(T - 0.01).toFixed(2)});
  window.__timelines = window.__timelines || {};
  window.__timelines.words = tl;
</script>
</body></html>`;
  return zipSync({ "index.html": strToU8(html) });
}

/**
 * Renders the project on HeyGen HyperFrames (see-through WebM) and returns
 * the file, or null if it fails or takes longer than `waitMs`.
 */
export async function renderAnimatedWords(project: Uint8Array, shape: Shape, key: string, waitMs = 240_000): Promise<Buffer | null> {
  const H = { "x-api-key": process.env.HEYGEN_API_KEY ?? "", "Content-Type": "application/json" };
  try {
    const res = await fetch("https://api.heygen.com/v3/hyperframes/renders", {
      method: "POST",
      headers: { ...H, "Idempotency-Key": key.slice(0, 250) },
      body: JSON.stringify({
        project: { type: "base64", media_type: "application/zip", data: Buffer.from(project).toString("base64") },
        format: "webm", resolution: "1080p", aspect_ratio: shape === "vertical" ? "9:16" : "16:9", fps: 30, quality: "standard",
        title: "SparkReels template words",
      }),
    });
    const text = await res.text();
    if (!res.ok) { console.warn(`[templates] HyperFrames refused (${res.status}): ${text.slice(0, 200)}`); return null; }
    const id = (JSON.parse(text) as { data?: { render_id?: string } }).data?.render_id;
    if (!id) return null;
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 4000));
      const d = ((await (await fetch(`https://api.heygen.com/v3/hyperframes/renders/${id}`, { headers: H })).json()) as { data?: { status?: string; video_url?: string } }).data ?? {};
      if (d.status === "completed" && d.video_url) {
        const f = await fetch(d.video_url);
        return f.ok ? Buffer.from(await f.arrayBuffer()) : null;
      }
      if (d.status === "failed") { console.warn(`[templates] HyperFrames render ${id} failed`); return null; }
    }
    console.warn(`[templates] HyperFrames render ${id} took too long`);
    return null;
  } catch (err) {
    console.warn("[templates] HyperFrames:", err instanceof Error ? err.message : err);
    return null;
  }
}

export type { Admin };
