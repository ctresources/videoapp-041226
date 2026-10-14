"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";

/**
 * My Sparks: videos waiting in line to start, and any that could not.
 *
 * The line (lib/video/render-queue) starts a video on its own when HeyGen
 * has a free slot, usually within minutes. A video that waited there is
 * otherwise invisible until it starts, since it has no video row yet.
 */
interface Item {
  id: string;
  projectId: string;
  title: string;
  status: string;
  position: number | null;
  error: string | null;
}

export function RenderQueueNotice() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch("/api/video/queue")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!stop && Array.isArray(d?.items)) setItems(d.items); })
        .catch(() => {});
    void load();
    const id = setInterval(load, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, []);

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch("/api/video/queue", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  const waiting = items.filter((i) => i.status === "queued" || i.status === "starting");
  const failed = items.filter((i) => i.status === "failed");
  if (waiting.length === 0 && failed.length === 0) return null;

  return (
    <div className="mb-5 flex flex-col gap-3">
      {waiting.length > 0 && (
        <div className="rounded-xl border border-spark-amber bg-spark-amber-tint px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-spark-ink">
            <Clock size={15} className="shrink-0 text-[#A3660F]" />
            In line, starting on its own
          </p>
          <ul className="mt-2 space-y-1.5">
            {waiting.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-spark-ink-soft">
                <span className="min-w-0 truncate">
                  {i.title}{i.position && i.position > 1 ? ` · number ${i.position}` : ""}
                </span>
                {i.status === "queued" && (
                  <button
                    type="button"
                    onClick={() => remove(i.id)}
                    className="text-xs font-semibold text-spark-ink-muted hover:text-red-600"
                  >
                    Take out of line
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {failed.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <AlertTriangle size={15} className="shrink-0" />
            {failed.length === 1 ? "A video couldn't start" : `${failed.length} videos couldn't start`}
          </p>
          <ul className="mt-2 space-y-2">
            {failed.map((i) => (
              <li key={i.id} className="text-sm text-red-900">
                <p className="font-medium">{i.title}</p>
                {i.error && <p className="text-xs text-red-800">{i.error}</p>}
                <div className="mt-1 flex gap-3 text-xs font-semibold">
                  <Link href={`/create/${i.projectId}`} className="text-red-700 hover:underline">Open it</Link>
                  <button type="button" onClick={() => remove(i.id)} className="text-red-500 hover:underline">Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
