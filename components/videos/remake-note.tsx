"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";

/**
 * The video check found a problem in the render itself (2026-11-15, the
 * owner's approved mockup #2): "Speech cuts off at 1:52 · Remake · free".
 * Remaking doesn't use one of the agent's videos. Post anyway lets a held
 * automatic post go ahead.
 */
export function RemakeNote({ videoId, projectId, problem, held }: {
  videoId: string;
  projectId: string | null;
  problem: { at: string; what: string };
  held?: boolean;
}) {
  const [posting, setPosting] = useState(false);
  const [released, setReleased] = useState(false);

  async function postAnyway() {
    setPosting(true);
    try {
      const res = await fetch("/api/video/check-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, action: "post_anyway" }),
      });
      if (!res.ok) throw new Error();
      setReleased(true);
    } catch {
      toast.error("Couldn't change that. Try again.");
    } finally { setPosting(false); }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F3DDA0] bg-[#FFF8E6] px-3 py-2 text-sm text-[#8A5A00]">
      <span>{problem.what}{problem.at ? ` at ${problem.at}` : ""}</span>
      <span className="flex items-center gap-2">
        {held && !released && (
          <button type="button" onClick={postAnyway} disabled={posting} className="px-1 text-xs font-semibold underline disabled:opacity-50">
            Post anyway
          </button>
        )}
        {projectId && (
          <Link href={`/create/${projectId}`} className="rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#A3660F]">
            Remake · free
          </Link>
        )}
      </span>
    </div>
  );
}
