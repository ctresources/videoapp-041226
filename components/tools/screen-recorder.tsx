"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, Mail, Play, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import { createClient } from "@/lib/supabase/client";
import { CAMERA_LENGTHS, type CameraLength } from "@/lib/utils/video-length";

/**
 * Record My Screen, in Spark Tools (2026-10-27, the owner: the Camera page's
 * way was "very confusing"). The camera recorder in its simple mode: the
 * corner-circle switch and Start recording. Saved to My Sparks like any take.
 */
export function ScreenRecorderTool() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [saved, setSaved] = useState<{ videoId: string; projectId: string | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [length, setLength] = useState<CameraLength>(CAMERA_LENGTHS[0].key);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function"
      && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!saved) return;
    let tries = 0;
    const t = setInterval(async () => {
      tries++;
      const { data } = await createClient().from("generated_videos").select("video_url").eq("id", saved.videoId).maybeSingle();
      const u = (data as { video_url: string | null } | null)?.video_url;
      if (u || tries > 20) { setUrl(u ?? null); clearInterval(t); }
    }, 2000);
    return () => clearInterval(t);
  }, [saved]);

  if (supported === false) {
    return (
      <div>
        <h2 className="text-lg font-bold text-spark-ink">Record My Screen</h2>
        <p className="mt-1 text-sm text-spark-ink-muted">Screen recording works in Chrome or Edge on a computer.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-spark-ink">Record My Screen</h2>
      <p className="mb-4 text-sm text-spark-ink-muted">Free and unlimited. Saved to My Sparks.</p>

      {saved ? (
        <div className="rounded-2xl border border-spark-rule bg-white p-4">
          <p className="font-semibold text-[#0f7a52]">✓ Saved to My Sparks</p>
          {url && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video src={url} controls playsInline className="mt-3 w-full max-w-2xl rounded-xl bg-black" />
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {url && <a href={url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Play size={13} /> Watch</Button></a>}
            {url && <a href={url} download><Button size="sm" variant="outline" className="gap-1.5"><Download size={13} /> Download</Button></a>}
            <Link href={`/videos?highlight=${saved.videoId}`}><Button size="sm" variant="outline" className="gap-1.5"><Upload size={13} /> Publish</Button></Link>
            <Link href={`/video-email?video=${saved.videoId}`}><Button size="sm" variant="outline" className="gap-1.5"><Mail size={13} /> Email it</Button></Link>
            <Button size="sm" className="gap-1.5" onClick={() => { setSaved(null); setUrl(null); setRound((r) => r + 1); }}><RefreshCw size={13} /> Record another</Button>
          </div>
        </div>
      ) : supported ? (
        <div className="max-w-2xl">
          <CameraRecorder
            key={round}
            simple
            initialScreen
            freestyle
            brollOff
            micTools={false}
            initialShape="horizontal"
            scriptLength={length}
            onScriptLengthChange={setLength}
            onSaved={setSaved}
          />
        </div>
      ) : null}
    </div>
  );
}
