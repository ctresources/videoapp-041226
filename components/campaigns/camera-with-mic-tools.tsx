"use client";

import { useState } from "react";
import Link from "next/link";
import { CameraRecorder } from "@/components/video/CameraRecorder";
import type { CameraLength } from "@/lib/utils/video-length";

/**
 * The hidden harness for trying the shared microphone tools on real devices.
 *
 * It holds only what CameraRecorder needs from the page above it — the script
 * length — and passes micTools. Nothing here is production: the Camera tab
 * renders the same component without micTools and is unchanged.
 */
export function CameraWithMicTools() {
  const [scriptLength, setScriptLength] = useState<CameraLength>("standard");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-spark-ink">Camera with microphone tools</h1>
        <p className="mt-1 text-[13px] text-spark-ink-muted">
          The Camera recorder, with the shared microphone picker, level meter and pre-flight check.
          The live Camera tab is untouched while this is tried out.{" "}
          <Link href="/campaigns/microphone" className="text-spark-amber hover:underline">Microphone settings</Link>
        </p>
      </div>
      <CameraRecorder
        micTools
        scriptLength={scriptLength}
        onScriptLengthChange={setScriptLength}
        freestyle
      />
    </div>
  );
}
