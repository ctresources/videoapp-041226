/**
 * Branded Look record-time compositing.
 *
 * Draws the camera feed through a canvas and burns overlays directly into
 * the recording as it happens — logo watermark, name/brokerage lower bar,
 * live captions, an optional music bed, and a 3-second branded end card.
 * The output of init() is a MediaStream (canvas video + mixed audio) that
 * feeds both the on-screen preview and the MediaRecorder, so what the user
 * sees is exactly what gets recorded. No post-processing, no vendors.
 *
 * Callers MUST keep the plain (non-composited) path as fallback: construction
 * or init() can throw, and isSupported() gates the feature entirely.
 */

export interface BrandInfo {
  name?: string | null;
  brokerage?: string | null;
  license?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  logoUrl?: string | null;
  headshotUrl?: string | null;
}

function loadImage(url: string, timeoutMs = 3000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}

export class BrandedComposite {
  stream: MediaStream | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private raf = 0;
  private audioCtx: AudioContext | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private logo: HTMLImageElement | null = null;
  private headshot: HTMLImageElement | null = null;
  private caption = { text: "", at: 0 };
  private endCardUntil = 0;
  private destroyed = false;

  constructor(private brand: BrandInfo, private musicUrl: string | null) {}

  static isSupported(): boolean {
    return (
      typeof HTMLCanvasElement !== "undefined" &&
      typeof (HTMLCanvasElement.prototype as unknown as { captureStream?: unknown }).captureStream === "function"
    );
  }

  /** Builds the composite pipeline from the raw camera stream. */
  async init(cameraStream: MediaStream): Promise<MediaStream> {
    const track = cameraStream.getVideoTracks()[0];
    const settings = track?.getSettings() ?? {};
    const W = settings.width || 1280;
    const H = settings.height || 720;

    // Hidden <video> that plays the raw camera feed for the draw loop
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = cameraStream;
    await videoEl.play();
    this.videoEl = videoEl;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;

    // Brand assets — recording still works if either fails to load
    const [logo, headshot] = await Promise.all([
      this.brand.logoUrl ? loadImage(this.brand.logoUrl) : Promise.resolve(null),
      this.brand.headshotUrl ? loadImage(this.brand.headshotUrl) : Promise.resolve(null),
    ]);
    this.logo = logo;
    this.headshot = headshot;

    // Audio: mic only, or mic + ducked music bed via WebAudio
    let audioTrack = cameraStream.getAudioTracks()[0] ?? null;
    if (this.musicUrl) {
      try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();

        const micSrc = audioCtx.createMediaStreamSource(cameraStream);
        const micGain = audioCtx.createGain();
        micGain.gain.value = 1.0;
        micSrc.connect(micGain).connect(dest);

        const musicEl = new Audio();
        musicEl.crossOrigin = "anonymous";
        musicEl.src = this.musicUrl;
        musicEl.loop = true;
        const musicSrc = audioCtx.createMediaElementSource(musicEl);
        const musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.1; // ducked well under the voice
        musicSrc.connect(musicGain).connect(dest);

        this.audioCtx = audioCtx;
        this.musicEl = musicEl;
        audioTrack = dest.stream.getAudioTracks()[0];
      } catch {
        // Music mixing failed — record voice-only rather than aborting
        this.audioCtx = null;
        this.musicEl = null;
      }
    }

    const canvasStream = (canvas as unknown as { captureStream: (fps: number) => MediaStream }).captureStream(30);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audioTrack) tracks.push(audioTrack);
    this.stream = new MediaStream(tracks);

    const draw = () => {
      if (this.destroyed) return;
      this.drawFrame(W, H);
      this.raf = requestAnimationFrame(draw);
    };
    draw();

    return this.stream;
  }

  setCaption(text: string) {
    this.caption = { text, at: performance.now() };
  }

  startMusic() {
    this.audioCtx?.resume().catch(() => {});
    this.musicEl?.play().catch(() => {});
  }
  pauseMusic() { this.musicEl?.pause(); }

  /** Switches the draw loop to the branded end card for the given duration. */
  beginEndCard(ms: number) {
    this.endCardUntil = performance.now() + ms;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    try { this.musicEl?.pause(); } catch { /* noop */ }
    this.musicEl = null;
    try { this.audioCtx?.close(); } catch { /* noop */ }
    this.audioCtx = null;
    try {
      this.videoEl?.pause();
      if (this.videoEl) this.videoEl.srcObject = null;
    } catch { /* noop */ }
    this.videoEl = null;
    this.stream?.getVideoTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  private drawFrame(W: number, H: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = performance.now();

    if (this.endCardUntil && now < this.endCardUntil) {
      this.drawEndCard(W, H);
      return;
    }

    if (this.videoEl && this.videoEl.readyState >= 2) {
      ctx.drawImage(this.videoEl, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }

    // Logo watermark — top right
    if (this.logo) {
      const lw = W * 0.11;
      const lh = lw * (this.logo.height / this.logo.width);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(this.logo, W - lw - W * 0.02, H * 0.03, lw, lh);
      ctx.globalAlpha = 1;
    }

    // Name bar — bottom left
    const name = this.brand.name?.trim();
    if (name) {
      const sub = [this.brand.brokerage, this.brand.license ? `Lic# ${this.brand.license}` : ""]
        .filter(Boolean)
        .join("  ·  ");
      const nameSize = Math.round(H * 0.032);
      const subSize = Math.round(H * 0.022);
      const padX = Math.round(H * 0.02);
      const padY = Math.round(H * 0.014);

      ctx.font = `700 ${nameSize}px Arial, sans-serif`;
      const nameW = ctx.measureText(name).width;
      ctx.font = `400 ${subSize}px Arial, sans-serif`;
      const subW = sub ? ctx.measureText(sub).width : 0;
      const barW = Math.max(nameW, subW) + padX * 2;
      const barH = nameSize + (sub ? subSize + padY : 0) + padY * 2;
      const barX = W * 0.02;
      const barY = H - barH - H * 0.03;

      ctx.fillStyle = "rgba(10, 15, 35, 0.6)";
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 10);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${nameSize}px Arial, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(name, barX + padX, barY + padY);
      if (sub) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `400 ${subSize}px Arial, sans-serif`;
        ctx.fillText(sub, barX + padX, barY + padY + nameSize + padY * 0.4);
      }
    }

    // Live captions — bottom center, above the name bar zone
    if (this.caption.text && now - this.caption.at < 4000) {
      const capSize = Math.round(H * 0.048);
      ctx.font = `800 ${capSize}px Arial, sans-serif`;
      ctx.textBaseline = "middle";
      const lines = wrapText(this.caption.text, 32).slice(-2);
      const lineH = capSize * 1.35;
      const baseY = H - H * 0.16 - (lines.length - 1) * lineH;

      lines.forEach((line, i) => {
        const y = baseY + i * lineH;
        const tw = ctx.measureText(line).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        ctx.beginPath();
        ctx.roundRect(W / 2 - tw / 2 - capSize * 0.5, y - lineH / 2, tw + capSize, lineH, 8);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(line, W / 2 - tw / 2, y);
      });
    }
  }

  private drawEndCard(W: number, H: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // Navy gradient background
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0f1e46");
    grad.addColorStop(1, "#312e81");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    let y = H * 0.22;

    // Headshot in a ringed circle
    if (this.headshot) {
      const r = H * 0.14;
      const cx = W / 2;
      const cy = y + r;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      const side = Math.min(this.headshot.width, this.headshot.height);
      ctx.drawImage(
        this.headshot,
        (this.headshot.width - side) / 2, (this.headshot.height - side) / 2, side, side,
        cx - r, cy - r, r * 2, r * 2,
      );
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f59e0b";
      ctx.stroke();
      y = cy + r + H * 0.06;
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    if (this.brand.name) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.round(H * 0.06)}px Arial, sans-serif`;
      ctx.fillText(this.brand.name, W / 2, y);
      y += H * 0.085;
    }

    const subLine = [this.brand.brokerage, this.brand.phone].filter(Boolean).join("  ·  ");
    if (subLine) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `500 ${Math.round(H * 0.035)}px Arial, sans-serif`;
      ctx.fillText(subLine, W / 2, y);
      y += H * 0.07;
    }

    const market = [this.brand.city, this.brand.state].filter(Boolean).join(", ");
    ctx.fillStyle = "#f59e0b";
    ctx.font = `700 ${Math.round(H * 0.032)}px Arial, sans-serif`;
    ctx.fillText(
      market ? `Subscribe for more ${market} real estate` : "Subscribe for more local real estate",
      W / 2,
      y,
    );

    ctx.textAlign = "left"; // reset for overlay drawing
  }
}
