"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Note {
  id: string;
  kind: "fixed" | "needs";
  title: string;
  body: string | null;
  action_label: string | null;
  action_href: string | null;
}

/**
 * Sparklee's notes at the top of My Sparks (2026-10-26, usability sweep #12):
 * "Fixed for you" when the app repaired something itself, "Needs you" when
 * only the agent can. Last two weeks, newest first, until dismissed.
 */
export function SparkleeNotes({ preview }: { /** Shown as is (screenshots). */ preview?: Note[] } = {}) {
  const [notes, setNotes] = useState<Note[]>(preview ?? []);

  useEffect(() => {
    if (preview) return;
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    createClient()
      .from("sparklee_notes")
      .select("id, kind, title, body, action_label, action_href")
      .is("dismissed_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setNotes((data ?? []) as Note[]));
  }, [preview]);

  async function dismiss(id: string) {
    setNotes((n) => n.filter((x) => x.id !== id));
    await createClient().from("sparklee_notes").update({ dismissed_at: new Date().toISOString() }).eq("id", id);
  }

  if (!notes.length) return null;
  return (
    <div className="mb-5 flex flex-col gap-2">
      {notes.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-3 rounded-xl border bg-white px-4 py-3 border-spark-rule border-l-4 ${n.kind === "fixed" ? "border-l-emerald-500" : "border-l-spark-amber"}`}
        >
          <span className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-spark-amber-tint">
            <Image src="/sparklee.webp" alt="" width={32} height={32} className="h-full w-full" unoptimized />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-spark-ink-faint">
              {n.kind === "fixed" ? "Fixed for you" : "Needs you"}
            </p>
            <p className="text-sm font-semibold text-spark-ink">{n.title}</p>
            {n.body && <p className="mt-0.5 text-[13px] text-spark-ink-muted">{n.body}</p>}
            {n.action_label && n.action_href && (
              <Link href={n.action_href} className="mt-2 inline-block rounded-lg bg-spark-amber px-3 py-1.5 text-xs font-semibold text-white">
                {n.action_label}
              </Link>
            )}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => void dismiss(n.id)} className="text-spark-ink-faint hover:text-spark-ink">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
