"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** Where the user is in the Create flow.
 *
 *  The v2 design draws this in the top bar — a step name and a gradient rail
 *  that fills as you move through. The values belong to the Create page, but
 *  the bar that shows them lives in the dashboard layout, so they travel
 *  through here rather than by prop-drilling the whole shell. */
export type CreateProgress = { label: string; percent: number };

const CreateProgressContext = createContext<{
  progress: CreateProgress | null;
  setProgress: (p: CreateProgress | null) => void;
}>({ progress: null, setProgress: () => {} });

export function CreateProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<CreateProgress | null>(null);
  return (
    <CreateProgressContext.Provider value={{ progress, setProgress }}>
      {children}
    </CreateProgressContext.Provider>
  );
}

/** Null on every route except Create — the topbar reads that as "stay normal". */
export function useCreateProgress() {
  return useContext(CreateProgressContext).progress;
}

/** Publishes the current step. Clears on unmount, so leaving Create puts the
 *  bar back to its ordinary white self without the page having to say so. */
export function usePublishCreateProgress(label: string, percent: number) {
  const { setProgress } = useContext(CreateProgressContext);
  useEffect(() => {
    setProgress({ label, percent });
    return () => setProgress(null);
  }, [label, percent, setProgress]);
}
