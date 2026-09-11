"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle, CheckCircle2, Loader2, Mic, MicOff, Play, RefreshCw, Square } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useMicrophone, micErrorMessage } from "@/lib/hooks/use-microphone";
import { extensionForType, pickAudioMimeType, recordedType } from "@/lib/utils/recording-format";

const TEST_SECONDS = 5;

const card = "rounded-xl border border-spark-rule bg-white p-4";
const label = "mb-1 block text-[11px] font-medium text-spark-ink-muted";
const quietBtn = "inline-flex items-center gap-1.5 rounded-full border border-spark-rule bg-white px-3 py-1.5 text-xs font-medium text-spark-ink-soft transition hover:bg-spark-paper disabled:opacity-50";
const ctaBtn = "spark-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium disabled:opacity-50";

/**
 * Camera and Microphone settings, plus the check that proves it works.
 *
 * The five-second sample lives in memory and in a blob URL for playback. It is
 * never uploaded and never stored: leaving the page drops it, which is why
 * there is no Save for the audio itself — only for which microphone to use.
 */
export function MicrophoneCheck() {
  const mic = useMicrophone();
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(TEST_SECONDS);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleType, setSampleType] = useState("");
  const [heardWhileRecording, setHeardWhileRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sampleUrlRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef(false);

  // The meter reads high enough during the sample to say we heard something.
  useEffect(() => {
    if (recording && mic.level > 12) { heardRef.current = true; setHeardWhileRecording(true); }
  }, [recording, mic.level]);

  const dropSample = useCallback(() => {
    if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
    sampleUrlRef.current = null;
    setSampleUrl(null);
  }, []);

  // Leaving the page: stop recording, drop the sample, close the microphone.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    if (sampleUrlRef.current) URL.revokeObjectURL(sampleUrlRef.current);
  }, []);

  async function allowAccess() {
    const stream = await mic.start();
    if (stream) toast.success("Microphone on.");
  }

  function recordSample() {
    const stream = mic.streamRef.current;
    if (!stream) { toast.error("Turn the microphone on first."); return; }
    const format = pickAudioMimeType();
    if (typeof MediaRecorder === "undefined") {
      toast.error("This browser cannot record in a compatible format. Try the latest version of Safari, Chrome or Edge.");
      return;
    }

    dropSample();
    chunksRef.current = [];
    heardRef.current = false;
    setHeardWhileRecording(false);

    try {
      const recorder = new MediaRecorder(stream, format ? { mimeType: format } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recordedType(recorder, format);
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const url = URL.createObjectURL(blob);
        sampleUrlRef.current = url;
        setSampleUrl(url);
        setSampleType(type);
        setRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      recorder.start();
      setRecording(true);
      setCountdown(TEST_SECONDS);
      timerRef.current = setInterval(() => setCountdown((s) => Math.max(0, s - 1)), 1000);
      stopTimeoutRef.current = setTimeout(() => {
        try { recorder.stop(); } catch { /* stopped by hand already */ }
      }, TEST_SECONDS * 1000);
    } catch (err) {
      setRecording(false);
      toast.error(micErrorMessage(err));
    }
  }

  function stopSample() {
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
  }

  const verdict = !mic.open ? null
    : mic.clipping ? { ok: false, text: "That's very loud and will distort. Move back from the microphone or turn its input down." }
    : mic.signalDetected ? { ok: true, text: "Your microphone is working." }
    : { ok: false, text: "We cannot hear you. Check that the correct microphone is selected and that it is not muted." };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-spark-ink">Camera and Microphone</h1>
        <p className="mt-1 text-[13px] text-spark-ink-muted">
          Set up the microphone SparkReels uses, and check it works — before you record anything that matters.
        </p>
      </div>

      {mic.notice && (
        <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px]", mic.notice.kind === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-spark-blue/20 bg-spark-blue/10 text-spark-blue")}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{mic.notice.message}</span>
          <button onClick={mic.clearNotice} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {mic.error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          <MicOff size={14} className="mt-0.5 shrink-0" />
          <span>{mic.error}</span>
        </div>
      )}

      {/* Permission and level */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-spark-ink">Microphone access</div>
            <div className="text-[11.5px] text-spark-ink-muted">
              {mic.permission === "granted" ? "Allowed in this browser"
                : mic.permission === "denied" ? "Blocked in this browser"
                : "Not asked for yet"}
            </div>
          </div>
          {mic.open ? (
            <button onClick={mic.stop} className={quietBtn}><Square size={12} /> Turn microphone off</button>
          ) : (
            <button onClick={allowAccess} className={ctaBtn}><Mic size={13} /> Allow Microphone Access</button>
          )}
        </div>

        <div className="mt-3">
          <div className={label}>Input level</div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-spark-paper">
            <div
              className={cn("h-full transition-[width] duration-75", mic.clipping ? "bg-red-500" : "bg-spark-amber")}
              style={{ width: `${mic.open ? mic.level : 0}%` }}
            />
          </div>
          {verdict && (
            <p className={cn("mt-2 flex items-start gap-1.5 text-[12px]", verdict.ok ? "text-emerald-700" : "text-[#8D580F]")}>
              {verdict.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
              {verdict.text}
            </p>
          )}
          {!mic.open && !mic.error && (
            <p className="mt-2 text-[12px] text-spark-ink-faint">Turn the microphone on to see the level move as you speak.</p>
          )}
        </div>
      </div>

      {/* Device choice */}
      <div className={card}>
        <div className="text-[13px] font-semibold text-spark-ink">Select Microphone</div>
        {mic.permission !== "granted" || mic.devices.length === 0 ? (
          <p className="mt-1 text-[12px] text-spark-ink-faint">
            Your microphones appear here once you allow access — browsers hide their names until then.
          </p>
        ) : (
          <>
            <select
              value={mic.selectedId ?? ""}
              onChange={(e) => void mic.select(e.target.value)}
              aria-label="Microphone"
              className="mt-2 w-full rounded-lg border border-spark-rule bg-white px-3 py-2 text-[13px] text-spark-ink focus:outline-none focus:ring-2 focus:ring-spark-amber/30"
            >
              {!mic.selectedId && <option value="">Default microphone</option>}
              {mic.devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)}
            </select>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={mic.savePreferred} disabled={!mic.open} className={quietBtn}>
                Save as My Preferred Microphone
              </button>
              <span className="text-[11.5px] text-spark-ink-faint">
                {mic.activeLabel ? `In use: ${mic.activeLabel}` : "Remembered on this browser and device."}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Five-second test */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-spark-ink">Test My Microphone</div>
            <div className="text-[11.5px] text-spark-ink-muted">
              Record five seconds and play it back. Nothing is uploaded or kept.
            </div>
          </div>
          {recording ? (
            <button onClick={stopSample} className={quietBtn}><Square size={12} /> Stop ({countdown}s)</button>
          ) : (
            <button onClick={recordSample} disabled={!mic.open} className={ctaBtn}>
              <Mic size={13} /> Record five seconds
            </button>
          )}
        </div>

        {recording && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-spark-ink-muted">
            <Loader2 size={13} className="animate-spin" /> Recording — say a sentence at your normal volume.
          </p>
        )}

        {sampleUrl && !recording && (
          <div className="mt-3 space-y-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={sampleUrl} controls className="w-full" />
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={recordSample} className={quietBtn}><RefreshCw size={12} /> Record again</button>
              <button onClick={dropSample} className={quietBtn}>Discard</button>
              <span className="text-[11.5px] text-spark-ink-faint">Recorded as {sampleType || "an unknown format"}</span>
            </div>
            {!heardWhileRecording && (
              <p className="flex items-start gap-1.5 text-[12px] text-[#8D580F]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                We heard nothing while that recorded. Check the microphone isn&apos;t muted, then try again.
              </p>
            )}
          </div>
        )}

        {!mic.open && (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-spark-ink-faint">
            <Play size={12} /> Turn the microphone on to run the test.
          </p>
        )}
      </div>

      {/* Diagnostics — no audio content, only how the device is set up */}
      <div className={card}>
        <div className="text-[13px] font-semibold text-spark-ink">Diagnostics</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
          {([
            ["Browser", `${mic.diagnostics.browser} on ${mic.diagnostics.os}`],
            ["Secure connection", mic.diagnostics.secureContext ? "Yes" : "No — microphone needs https"],
            ["Permission", mic.diagnostics.permission === "unknown" ? "Not reported by this browser" : mic.diagnostics.permission],
            ["Selected microphone", mic.diagnostics.selectedLabel ?? "None yet"],
            ["Recording format", mic.diagnostics.recordingFormat],
            ["File type", mic.recordingFormat ? extensionForType(mic.recordingFormat) : "—"],
            ["Audio signal", mic.diagnostics.signalDetected ? "Detected" : "None detected yet"],
            ["Error", mic.diagnostics.error ?? "None"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex min-w-0 flex-col">
              <dt className="text-[10.5px] text-spark-ink-faint">{k}</dt>
              <dd className="truncate text-spark-ink-soft" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] text-spark-ink-faint">
          This panel describes the device only. No audio is recorded, uploaded or logged here.
        </p>
      </div>
    </div>
  );
}
