"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track, type TrackEvent } from "@/lib/track";

/** A Link that records one analytics event when pressed. */
export function TrackedLink({
  href, event, className, children,
}: { href: string; event: TrackEvent; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => track(event)}>
      {children}
    </Link>
  );
}
