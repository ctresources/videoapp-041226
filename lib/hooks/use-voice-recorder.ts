"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "paused" | "stopped" | "error";

interface UseVoiceRecorderReturn {
  state: RecorderState;
  seconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  amplitudes: number[];
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [amplitudes, setAmplitudes] = useState<number[]>(Array(40).fill(0));
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const drawWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const step = Math.floor(dataArray.length / 40);
    const amps = Array.from({ length: 40 }, (_, i) => {
      const slice = dataArray.slice(i * step, (i + 1) * step);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      return Math.min(100, (avg / 255) * 100);
    });

    setAmplitudes(amps);
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const start = useCallback(async () => {
    setState("requesting");
    setError(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for waveform
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setState("stopped");
        stopTimer();
        stopAnimation();
        setAmplitudes(Array(40).fill(0));
      };

      recorder.start(100);
      setState("recording");

      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      drawWaveform();
    } catch (err) {
      setError("Microphone access denied. Please allow microphone access and try again.");
      setState("error");
    }
  }, [drawWaveform, stopTimer, stopAnimation]);

  const pause = useCallback(() => {
    mediaRecorderRef.current?.pause();
    setState("paused");
    stopTimer();
    stopAnimation();
  }, [stopTimer, stopAnimation]);

  const resume = useCallback(() => {
    mediaRecorderRef.current?.resume();
    setState("recording");
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    drawWaveform();
  }, [drawWaveform]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopTimer();
    stopAnimation();
  }, [stopTimer, stopAnimation]);

  const reset = useCallback(() => {
    stop();
    setAudioBlob(null);
    setAudioUrl(null);
    setSeconds(0);
    setAmplitudes(Array(40).fill(0));
    setState("idle");
    setError(null);
    chunksRef.current = [];
  }, [stop]);

  useEffect(() => {
    return () => {
      stopTimer();
      stopAnimation();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopTimer, stopAnimation]);

  return { state, seconds, audioBlob, audioUrl, amplitudes, start, pause, resume, stop, reset, error };
}
