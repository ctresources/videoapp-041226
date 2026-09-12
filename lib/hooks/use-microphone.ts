"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { pickAudioMimeType } from "@/lib/utils/recording-format";

/**
 * The shared microphone layer: permission, devices, levels, format and errors.
 *
 * Consolidation, not a rewrite. Dictation (speech recognition) and recording
 * (MediaRecorder) stay separate underneath — they are different browser APIs
 * solving different problems — but everything around them is the same job done
 * three times today: asking permission, choosing a device, showing a level,
 * picking a format, and turning a DOMException into something a person can act
 * on. That part lives here, and the recorders can adopt it one at a time
 * without changing what they do.
 *
 * Nothing here records or keeps audio. The five-second test in the settings
 * page holds its sample in memory only, and this hook drops every stream and
 * audio context when the page goes away.
 */

const PREFERRED_KEY = "sparkreels.microphone.preferred";

export type PermissionState = "unknown" | "prompt" | "granted" | "denied";

export interface MicDevice {
  deviceId: string;
  label: string;
}

/** Everything the diagnostic panel shows. No audio content, ever. */
export interface MicDiagnostics {
  browser: string;
  os: string;
  secureContext: boolean;
  permission: PermissionState;
  selectedLabel: string | null;
  recordingFormat: string;
  signalDetected: boolean;
  error: string | null;
}

export interface MicNotice {
  kind: "success" | "info" | "error";
  message: string;
}

/**
 * Browser failures, in words that say what to do.
 *
 * getUserMedia reports most of these as a DOMException whose name is the only
 * reliable part; the message differs per browser and is written for developers.
 */
export function micErrorMessage(err: unknown): string {
  const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Open your browser's site settings and allow microphone access for SparkReels.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "We could not find that microphone. Connect one, or use your device's built-in microphone.";
    case "NotReadableError":
    case "AbortError":
      return "Another application may be using your microphone. Close that application and try again.";
    default:
      return "We could not start your microphone. Check that it is connected, then try again.";
  }
}

function readPreferred(): { deviceId: string; label: string } | null {
  try {
    const raw = window.localStorage.getItem(PREFERRED_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { deviceId?: unknown; label?: unknown };
    if (typeof saved.deviceId !== "string") return null;
    return { deviceId: saved.deviceId, label: typeof saved.label === "string" ? saved.label : "" };
  } catch {
    return null;
  }
}

/** Browser and OS, from the user agent — for the diagnostic panel only. */
function describeAgent(): { browser: string; os: string } {
  if (typeof navigator === "undefined") return { browser: "Unknown", os: "Unknown" };
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : "Unknown browser";
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : "Unknown system";
  return { browser, os };
}

/**
 * The level of a stream somebody else already opened.
 *
 * The camera asks for video and audio in one permission prompt and holds that
 * one stream. Opening a second microphone stream just to draw a meter is
 * exactly what iOS punishes, so the meter reads the audio track that is
 * already there. Returns 0–100, plus whether it is peaking.
 */
export function useStreamLevel(stream: MediaStream | null): { level: number; clipping: boolean; heard: boolean } {
  const [level, setLevel] = useState(0);
  const [clipping, setClipping] = useState(false);
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) { setLevel(0); return; }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let live = true;

    const tick = () => {
      if (!live) return;
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const centred = (data[i] - 128) / 128;
        sum += centred * centred;
        peak = Math.max(peak, Math.abs(centred));
      }
      const shown = Math.min(100, Math.round(Math.sqrt(sum / data.length) * 280));
      setLevel(shown);
      if (shown > 12) setHeard(true);
      setClipping(peak > 0.98);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      live = false;
      cancelAnimationFrame(frame);
      void ctx.close().catch(() => {});
      setLevel(0);
      setClipping(false);
    };
  }, [stream]);

  return { level, clipping, heard };
}

/**
 * The microphones on this device, and the saved preference — without opening
 * a stream. For a screen that opens its own (the camera opens video and audio
 * together) but still wants a picker.
 */
export function useMicrophoneDevices(): {
  devices: MicDevice[];
  preferredId: string | null;
  setPreferredId: (id: string | null) => void;
  refresh: () => Promise<MicDevice[]>;
} {
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [preferredId, setPreferred] = useState<string | null>(null);

  useEffect(() => { setPreferred(readPreferred()?.deviceId ?? null); }, []);

  const refresh = useCallback(async (): Promise<MicDevice[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      setDevices(mics);
      return mics;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void refresh();
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = () => void refresh();
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refresh]);

  const setPreferredId = useCallback((id: string | null) => {
    setPreferred(id);
    try {
      if (!id) window.localStorage.removeItem(PREFERRED_KEY);
      else {
        const label = devices.find((d) => d.deviceId === id)?.label ?? "";
        window.localStorage.setItem(PREFERRED_KEY, JSON.stringify({ deviceId: id, label }));
      }
    } catch { /* a browser with storage blocked still records */ }
  }, [devices]);

  return { devices, preferredId, setPreferredId, refresh };
}

export interface UseMicrophone {
  permission: PermissionState;
  devices: MicDevice[];
  selectedId: string | null;
  /** The device actually in use, which can differ from the saved choice. */
  activeLabel: string | null;
  /** 0–100, updated while the microphone is open. */
  level: number;
  /** Loud enough to be heard at some point since opening. */
  signalDetected: boolean;
  /** Peaking, so the recording would distort. */
  clipping: boolean;
  open: boolean;
  notice: MicNotice | null;
  error: string | null;
  recordingFormat: string;
  diagnostics: MicDiagnostics;
  /** Ask for permission and start listening. Must follow a tap on iOS. */
  start: (deviceId?: string) => Promise<MediaStream | null>;
  stop: () => void;
  select: (deviceId: string) => Promise<void>;
  savePreferred: () => void;
  clearNotice: () => void;
  /** The live stream, for a recorder that wants to use it. */
  streamRef: MutableRefObject<MediaStream | null>;
}

export function useMicrophone(): UseMicrophone {
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [signalDetected, setSignalDetected] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<MicNotice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordingFormat, setRecordingFormat] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  // The device we are actually on, read back in the devicechange handler
  // without making it depend on state that changes every frame.
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    setRecordingFormat(pickAudioMimeType());
    setSelectedId(readPreferred()?.deviceId ?? null);
  }, []);

  /** Labels only arrive once permission is granted; before that they are blank. */
  const refreshDevices = useCallback(async (): Promise<MicDevice[]> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      setDevices(mics);
      return mics;
    } catch {
      return [];
    }
  }, []);

  const stopMeter = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  const stop = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    activeIdRef.current = null;
    setOpen(false);
    setActiveLabel(null);
    setClipping(false);
  }, [stopMeter]);

  /** Loudness as 0–100, with clipping and "we heard something" alongside it. */
  const meter = useCallback((stream: MediaStream) => {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      const a = analyserRef.current;
      if (!a) return;
      a.getByteTimeDomainData(data);
      let peak = 0;
      let sum = 0;
      // Indexed rather than for…of: this runs every animation frame, and the
      // project's build target does not iterate typed arrays directly.
      for (let i = 0; i < data.length; i++) {
        const centred = (data[i] - 128) / 128;
        sum += centred * centred;
        peak = Math.max(peak, Math.abs(centred));
      }
      const rms = Math.sqrt(sum / data.length);
      // Speech sits well below full scale, so the bar would barely move on a
      // linear reading. This maps a normal speaking voice to the middle.
      const shown = Math.min(100, Math.round(rms * 280));
      setLevel(shown);
      if (shown > 12) setSignalDetected(true);
      setClipping(peak > 0.98);
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const start = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot use a microphone. Try the latest Safari, Chrome or Edge.");
      return null;
    }
    if (!window.isSecureContext) {
      setError("Microphone access needs a secure connection (https). Open SparkReels over https and try again.");
      return null;
    }

    // One stream at a time: iOS in particular misbehaves when a second is
    // opened while the first is live.
    stop();
    setError(null);
    setSignalDetected(false);

    const wanted = deviceId ?? selectedId ?? undefined;
    // The same settings the camera recorder already asks for, plus levelling:
    // the transcript matters more than studio sound.
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(wanted ? { deviceId: { exact: wanted } } : {}),
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      streamRef.current = stream;
      setPermission("granted");
      setOpen(true);
      const track = stream.getAudioTracks()[0];
      const settings = track?.getSettings();
      activeIdRef.current = settings?.deviceId ?? wanted ?? null;
      setActiveLabel(track?.label || "Default microphone");
      const mics = await refreshDevices();
      // Asked for one we no longer have: the browser gave us the default.
      if (wanted && settings?.deviceId && settings.deviceId !== wanted) {
        const savedLabel = readPreferred()?.label;
        setSelectedId(settings.deviceId);
        setNotice({
          kind: "info",
          message: `${savedLabel || "Your selected microphone"} isn't available, so we switched to ${track?.label || "the default microphone"}.`,
        });
      } else if (!selectedId && mics.length) {
        setSelectedId(settings?.deviceId ?? mics[0].deviceId);
      }
      meter(stream);
      return stream;
    } catch (err) {
      // A specific device that has gone: fall back rather than leave the user
      // stuck with a microphone they no longer own.
      const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
      if (wanted && (name === "NotFoundError" || name === "OverconstrainedError")) {
        setNotice({ kind: "info", message: "Your selected microphone disconnected. We switched to the default microphone." });
        setSelectedId(null);
        try {
          window.localStorage.removeItem(PREFERRED_KEY);
        } catch { /* a browser with storage blocked still records */ }
        return start(undefined);
      }
      if (name === "NotAllowedError" || name === "SecurityError") setPermission("denied");
      setError(micErrorMessage(err));
      setOpen(false);
      return null;
    }
  }, [meter, refreshDevices, selectedId, stop]);

  const select = useCallback(async (deviceId: string) => {
    setSelectedId(deviceId);
    if (open) await start(deviceId);
  }, [open, start]);

  const savePreferred = useCallback(() => {
    const id = activeIdRef.current ?? selectedId;
    if (!id) return;
    try {
      const label = devices.find((d) => d.deviceId === id)?.label ?? activeLabel ?? "";
      window.localStorage.setItem(PREFERRED_KEY, JSON.stringify({ deviceId: id, label }));
      setNotice({ kind: "success", message: "Saved as your preferred microphone on this device." });
    } catch {
      setNotice({ kind: "error", message: "This browser wouldn't let us remember that choice." });
    }
  }, [activeLabel, devices, selectedId]);

  /** Permission, where the browser will tell us without asking. */
  useEffect(() => {
    let cancelled = false;
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) { setPermission("unknown"); return; }
    perms
      // "microphone" is not in every lib.dom PermissionName union yet.
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state as PermissionState);
        status.onchange = () => setPermission(status.state as PermissionState);
      })
      .catch(() => { if (!cancelled) setPermission("unknown"); });
    return () => { cancelled = true; };
  }, []);

  /** A headset arriving or leaving mid-session. */
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = async () => {
      const mics = await refreshDevices();
      const activeId = activeIdRef.current;
      if (!activeId || !streamRef.current) return;
      const stillHere = mics.some((d) => d.deviceId === activeId);
      if (stillHere) return;
      setNotice({ kind: "info", message: "Your selected microphone disconnected. We switched to the default microphone." });
      setSelectedId(null);
      await start(undefined);
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refreshDevices, start]);

  // Leaving the page closes the microphone. Nothing is kept.
  useEffect(() => stop, [stop]);

  const agent = describeAgent();
  return {
    permission,
    devices,
    selectedId,
    activeLabel,
    level,
    signalDetected,
    clipping,
    open,
    notice,
    error,
    recordingFormat,
    diagnostics: {
      browser: agent.browser,
      os: agent.os,
      secureContext: typeof window !== "undefined" && window.isSecureContext,
      permission,
      selectedLabel: activeLabel,
      recordingFormat: recordingFormat || "none supported",
      signalDetected,
      error,
    },
    start,
    stop,
    select,
    savePreferred,
    clearNotice: () => setNotice(null),
    streamRef,
  };
}
