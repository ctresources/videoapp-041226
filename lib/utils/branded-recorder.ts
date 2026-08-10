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

// B-roll pacing. The lead-in keeps the speaker full-frame long enough to land
// their opening line before the first photo takes the background.
const BROLL_LEAD_IN_MS = 8000;
// How long any one photo holds — the ceiling when photos follow the script,
// and the interval when they run on the clock in constant-speed mode. Tuned by
// ear across real takes: spreading photos evenly over a long script parked each
// one for ~14s and read as a stall, while 6s and 8.5s both still felt rushed.
// The Ken Burns move is paced to the same figure, so it sets motion speed too.
const BROLL_HOLD_MS = 10000;
const BROLL_FADE_MS = 700;
const BROLL_ZOOM = 0.2; // Ken Burns push over each photo's hold
const BROLL_PAN = 0.5;  // share of the spare margin the drift travels
// Drift directions cycled per photo so consecutive shots don't move alike.
const BROLL_PANS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]];

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
  private endCardLatched = false;
  private destroyed = false;
  private hasDrawnFrame = false;
  private photos: HTMLImageElement[] = [];
  private brollElapsed = 0;
  private brollLastTick = 0;
  private brollRunning = false;
  private brollIndex = -1;
  private prevIndex: number | null = null;
  private brollShownAt = 0;
  private brollPass = 0;
  private scriptProgress: number | null = null;
  /** Set when the chosen music never loaded, so the caller can say so rather
   *  than letting the user record in silence expecting a soundtrack. */
  musicUnavailable = false;

  constructor(
    private brand: BrandInfo,
    private musicUrl: string | null,
    private photoUrls: string[] = [],
  ) {}

  static isSupported(): boolean {
    return (
      typeof HTMLCanvasElement !== "undefined" &&
      typeof (HTMLCanvasElement.prototype as unknown as { captureStream?: unknown }).captureStream === "function"
    );
  }

  /**
   * Off-screen but *attached*. A detached <video> is not guaranteed to decode
   * frames — it can sit at readyState 0 forever, which made drawFrame fall
   * through to its black fill and record a black video with only the overlays
   * on top. display:none suspends decoding for the same reason, so the element
   * is parked off-screen instead.
   */
  private mountVideoElement(cameraStream: MediaStream): HTMLVideoElement {
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    el.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;";
    el.srcObject = cameraStream;
    document.body.appendChild(el);
    return el;
  }

  /**
   * Resolves once the element actually has a frame to draw. Rejecting here is
   * what lets the caller fall back to the plain recording path — a plain video
   * is a far better outcome than a branded black one.
   */
  private static waitForFirstFrame(el: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
    if (el.readyState >= 2 && el.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        el.removeEventListener("loadeddata", onReady);
        el.removeEventListener("error", onFail);
      };
      const onReady = () => { cleanup(); resolve(); };
      const onFail = () => { cleanup(); reject(new Error("Camera produced no frames")); };
      const timer = setTimeout(onFail, timeoutMs);
      el.addEventListener("loadeddata", onReady);
      el.addEventListener("error", onFail);
    });
  }

  /**
   * readyState only says frames are decoding, not that we can actually read
   * them. Some GPU/driver combinations hand a perfectly good MediaStream to
   * MediaRecorder while every <video> element and canvas readback comes out
   * pure black — Chrome with graphics acceleration on flaky drivers is the
   * common case. That is invisible to every other check, so look at the pixels.
   */
  private static async assertFramesReadBack(videoEl: HTMLVideoElement): Promise<void> {
    const probe = document.createElement("canvas");
    probe.width = 64;
    probe.height = 36;
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return; // Can't inspect — don't block the feature on it.

    for (let attempt = 0; attempt < 5; attempt++) {
      pctx.drawImage(videoEl, 0, 0, probe.width, probe.height);
      let brightest = 0;
      try {
        const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
        for (let i = 0; i < data.length; i += 4) {
          const lum = data[i] + data[i + 1] + data[i + 2];
          if (lum > brightest) brightest = lum;
        }
      } catch {
        return; // Readback blocked for another reason — not ours to judge.
      }
      // Even a capped lens or a dark room carries sensor noise. An all-zero
      // readback across 2,304 pixels means the frames never crossed over.
      if (brightest > 6) return;
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error("Camera frames read back black");
  }

  /** Builds the composite pipeline from the raw camera stream. */
  async init(cameraStream: MediaStream): Promise<MediaStream> {
    try {
      return await this.build(cameraStream);
    } catch (err) {
      // Never leave a half-built pipeline (or its mounted element) behind —
      // the caller drops its reference and falls back to the plain path.
      this.destroy();
      this.destroyed = false;
      throw err;
    }
  }

  private async build(cameraStream: MediaStream): Promise<MediaStream> {
    const track = cameraStream.getVideoTracks()[0];
    const settings = track?.getSettings() ?? {};

    const videoEl = this.mountVideoElement(cameraStream);
    this.videoEl = videoEl;
    // Muted playback of a local stream shouldn't be blocked, but the frame
    // wait below is the real gate either way.
    try { await videoEl.play(); } catch { /* fall through to the frame wait */ }
    await BrandedComposite.waitForFirstFrame(videoEl);
    await BrandedComposite.assertFramesReadBack(videoEl);

    // The element's own dimensions are the source of truth — getSettings() can
    // come back empty on some devices, which silently forced a 1280x720 canvas.
    const W = videoEl.videoWidth || settings.width || 1280;
    const H = videoEl.videoHeight || settings.height || 720;

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

    // loadImage requests these with crossOrigin, so anything not CORS-clean
    // fails here and is dropped rather than tainting the canvas at draw time —
    // a tainted canvas cannot be recorded at all. /api/photos/rehost exists to
    // make scraped photos survive this filter.
    const loadedPhotos = await Promise.all(
      this.photoUrls.slice(0, 12).map((u) => loadImage(u, 6000)),
    );
    this.photos = loadedPhotos.filter((p): p is HTMLImageElement => p !== null);

    // Audio: mic only, or mic + ducked music bed via WebAudio
    let audioTrack = cameraStream.getAudioTracks()[0] ?? null;
    if (this.musicUrl) {
      // Load the track before wiring any of it up. A src that 404s or is
      // unreadable still yields a working graph that outputs pure silence, so
      // the recording came out with no music and nothing said why.
      const musicEl = new Audio();
      musicEl.crossOrigin = "anonymous";
      musicEl.loop = true;
      musicEl.src = this.musicUrl;
      const musicReady = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        musicEl.addEventListener("canplay", () => { clearTimeout(timer); resolve(true); }, { once: true });
        musicEl.addEventListener("error", () => { clearTimeout(timer); resolve(false); }, { once: true });
        musicEl.load();
      });

      if (!musicReady) {
        this.musicUnavailable = true;
      } else try {
        const audioCtx = new AudioContext();
        const dest = audioCtx.createMediaStreamDestination();

        // Audio tracks ONLY. Handing the full camera stream to a
        // MediaStreamAudioSourceNode makes Chrome stall video rendering on the
        // element playing that same stream — which silently emptied the
        // picture-in-picture while photos and audio carried on fine. The node
        // has no use for the video track regardless.
        const micStream = new MediaStream(cameraStream.getAudioTracks());
        const micSrc = audioCtx.createMediaStreamSource(micStream);
        const micGain = audioCtx.createGain();
        micGain.gain.value = 1.0;
        micSrc.connect(micGain).connect(dest);

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
        this.musicUnavailable = true;
      }
    }

    // Re-check the picture now the audio graph exists. The first check runs
    // before any of this is wired, so anything here that disturbs video
    // rendering — as createMediaStreamSource on a full camera stream does —
    // would otherwise sail through and record a faceless video.
    await BrandedComposite.assertFramesReadBack(videoEl);

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

  /** True once at least one photo survived loading and can be used as b-roll. */
  get hasBroll(): boolean { return this.photos.length > 0; }

  /** Starts or resumes the b-roll clock — it only runs while recording, so a
   *  long pause doesn't silently skip past several photos. */
  startBroll() {
    this.brollLastTick = performance.now();
    this.brollRunning = true;
  }
  pauseBroll() {
    this.tickBroll();
    this.brollRunning = false;
  }
  private tickBroll() {
    const now = performance.now();
    if (this.brollRunning) this.brollElapsed += now - this.brollLastTick;
    this.brollLastTick = now;
  }

  /**
   * How far the speaker has read through the script, 0..1. When this is fed
   * (voice-follow is running) the photos track what is actually being said
   * instead of a stopwatch — the first photo covers the opening tenth of the
   * script, and so on. Without it the timer below is the fallback.
   */
  setScriptProgress(p: number) {
    this.scriptProgress = Math.max(0, Math.min(1, p));
  }

  /** Which photo is on screen right now, how far into its Ken Burns push, and
   *  how far through the crossfade in. Null means the speaker stays full-frame. */
  private currentBrollShot() {
    if (this.photos.length === 0) return null;
    const t = this.brollElapsed - BROLL_LEAD_IN_MS;
    if (t < 0) return null;

    const len = this.photos.length;
    const now = performance.now();
    const since = now - this.brollShownAt;

    let idx: number;
    if (this.brollIndex < 0) {
      idx = 0;
    } else if (this.scriptProgress !== null && this.brollPass === 0) {
      // First pass follows the script, but never sits longer than the ceiling —
      // a photo per script-slice is far too slow on a long read.
      const target = Math.min(len - 1, Math.floor(this.scriptProgress * len));
      if (target > this.brollIndex) idx = target;
      else if (since > BROLL_HOLD_MS) {
        idx = this.brollIndex + 1;
        if (idx >= len) { idx = 0; this.brollPass++; } // photos exhausted — loop on the clock
      } else idx = this.brollIndex;
    } else {
      idx = since > BROLL_HOLD_MS ? (this.brollIndex + 1) % len : this.brollIndex;
    }

    if (idx !== this.brollIndex) {
      // -1 marks "no photo yet", so the first one rises out of the speaker.
      this.prevIndex = this.brollIndex >= 0 ? this.brollIndex : null;
      this.brollIndex = idx;
      this.brollShownAt = now;
    }

    const held = now - this.brollShownAt;
    return {
      img: this.photos[idx],
      prev: this.prevIndex === null ? null : this.photos[this.prevIndex],
      dir: idx,
      prevDir: this.prevIndex ?? 0,
      // Motion is paced to the hold so the push completes rather than
      // freezing partway through.
      progress: Math.min(1, held / BROLL_HOLD_MS),
      fade: Math.min(1, held / BROLL_FADE_MS),
    };
  }

  /**
   * Switches the draw loop to the branded end card, permanently.
   *
   * This used to expire after a duration, which handed the last frames of the
   * video back to the b-roll: the recorder stops slightly after the end card
   * ends, so the take finished on a photo instead of the contact card. The
   * caller decides when recording stops; the card simply holds until then.
   */
  beginEndCard() {
    this.endCardLatched = true;
  }

  destroy() {
    this.destroyed = true;
    this.brollRunning = false;
    this.photos = [];
    cancelAnimationFrame(this.raf);
    try { this.musicEl?.pause(); } catch { /* noop */ }
    this.musicEl = null;
    try { this.audioCtx?.close(); } catch { /* noop */ }
    this.audioCtx = null;
    try {
      this.videoEl?.pause();
      if (this.videoEl) {
        this.videoEl.srcObject = null;
        this.videoEl.remove();
      }
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
    this.tickBroll();

    if (this.endCardLatched) {
      this.drawEndCard(W, H);
      return;
    }

    const shot = this.currentBrollShot();
    if (shot) {
      // Photo fills the frame, speaker stays present in the corner.
      this.drawBrollBackground(shot, W, H);
      this.drawCameraPip(W, H);
      this.hasDrawnFrame = true;
    } else if (this.videoEl && this.videoEl.readyState >= 2) {
      ctx.drawImage(this.videoEl, 0, 0, W, H);
      this.hasDrawnFrame = true;
    } else if (!this.hasDrawnFrame) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
    }
    // A momentary stall mid-recording keeps the last good frame rather than
    // punching a black hole into the video.

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

  /** Lays the outgoing frame down first so a photo change reads as a crossfade
   *  rather than a cut, then the incoming photo over it. */
  private drawBrollBackground(
    shot: NonNullable<ReturnType<BrandedComposite["currentBrollShot"]>>,
    W: number,
    H: number,
  ) {
    const ctx = this.ctx;
    if (!ctx) return;

    if (shot.fade < 1) {
      if (shot.prev) {
        // Outgoing photo held at the end of its own move, so it doesn't snap.
        this.drawPhotoCover(shot.prev, W, H, 1 + BROLL_ZOOM, shot.prevDir, 1);
      } else if (this.videoEl && this.videoEl.readyState >= 2) {
        ctx.drawImage(this.videoEl, 0, 0, W, H); // first photo rises out of the speaker
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalAlpha = shot.fade;
    }

    // Travel runs -1..1 across the hold, so the photo drifts through the frame
    // rather than only creeping in from centre.
    this.drawPhotoCover(
      shot.img, W, H, 1 + BROLL_ZOOM * shot.progress, shot.dir, shot.progress * 2 - 1,
    );
    ctx.globalAlpha = 1;
  }

  /**
   * Fills WxH with the image, cropped to aspect, zoomed and drifting for Ken
   * Burns motion. `travel` runs -1..1 along the direction picked for this
   * photo; the zoom is what creates the spare margin the drift moves through.
   */
  private drawPhotoCover(
    img: HTMLImageElement, W: number, H: number, zoom: number, dirIndex: number, travel: number,
  ) {
    const ctx = this.ctx;
    if (!ctx || !img.width || !img.height) return;
    const target = W / H;
    let sw = img.width;
    let sh = img.height;
    if (img.width / img.height > target) sw = sh * target;
    else sh = sw / target;
    sw /= zoom;
    sh /= zoom;

    const [dx, dy] = BROLL_PANS[dirIndex % BROLL_PANS.length];
    const marginX = (img.width - sw) / 2;
    const marginY = (img.height - sh) / 2;
    const sx = marginX + dx * travel * BROLL_PAN * marginX;
    const sy = marginY + dy * travel * BROLL_PAN * marginY;

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
  }

  /** The speaker, circle-cropped, top left — the logo owns the top right and
   *  the name bar and captions own the bottom. */
  private drawCameraPip(W: number, H: number) {
    const ctx = this.ctx;
    const v = this.videoEl;
    if (!ctx || !v || v.readyState < 2 || !v.videoWidth) return;

    const d = H * 0.36;
    const cx = W * 0.035 + d / 2;
    const cy = H * 0.05 + d / 2;
    const side = Math.min(v.videoWidth, v.videoHeight);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = H * 0.025;
    ctx.fillStyle = "#000";
    ctx.fill(); // lays the drop shadow down before clipping to the circle
    ctx.shadowBlur = 0;
    ctx.clip();
    ctx.drawImage(
      v,
      (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side,
      cx - d / 2, cy - d / 2, d, d,
    );
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, d / 2 + 1, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(3, H * 0.005);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();
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

    // "Subscribe for more real estate in X" rather than "for more X real
    // estate" — the latter turns unreadable once the market is a phrase rather
    // than a single town.
    const market = [this.brand.city, this.brand.state].filter(Boolean).join(", ");
    ctx.fillStyle = "#f59e0b";
    ctx.font = `700 ${Math.round(H * 0.032)}px Arial, sans-serif`;
    ctx.fillText(
      market ? `Subscribe for more real estate in ${market}` : "Subscribe for more local real estate",
      W / 2,
      y,
    );

    ctx.textAlign = "left"; // reset for overlay drawing
  }
}
