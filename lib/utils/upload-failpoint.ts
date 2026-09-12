"use client";

/**
 * A way to make an upload fail on purpose, at a chosen stage.
 *
 * Recovery is only worth anything if the failure paths have actually been
 * walked, and the interesting ones are all timing: the upload dying between
 * the file landing in storage and the row being written, or the row being
 * written and the answer never arriving. Reproducing those by pulling the
 * network at the right half-second is not a test, it is a coincidence.
 *
 * Temporary, and meant to be removed once the camera recovery tests pass.
 *
 * Two things keep it away from real recordings: the control that sets it is
 * rendered only by the hidden QA page, and the setting expires on its own
 * (below) so one left switched on cannot quietly break the live Camera tab an
 * hour later.
 */

const KEY = "sparkreels.qa.uploadFailPoint";

/** How long a setting stays live before it is ignored and cleared. */
const EXPIRY_MS = 2 * 60 * 60 * 1000;

export type FailStage = "before-upload" | "after-upload" | "after-save";

/** What each stage leaves behind, which is the whole point of choosing one. */
export const STAGE_LABELS: Record<FailStage, string> = {
  "before-upload": "before the file was uploaded",
  "after-upload": "after the file uploaded, before it was saved",
  "after-save": "after it was saved — the reply never arrived",
};

export const STAGE_EFFECTS: Record<FailStage, string> = {
  "before-upload": "Nothing reaches storage. The recording is kept here and can be retried.",
  "after-upload": "The file is in storage but no video row exists. A retry replaces the file and saves it.",
  "after-save": "The video row EXISTS and this browser does not know. A retry must recognise it, not save a second one.",
};

export interface FailConfig {
  stage: FailStage | null;
  /** Fail only the next attempt, so the retry after it can succeed. */
  once: boolean;
  setAt: number;
}

const OFF: FailConfig = { stage: null, once: true, setAt: 0 };

/**
 * Whether anything on this page is allowed to simulate a failure.
 *
 * Set at runtime by the recorder when it is given the QA prop, and never
 * persisted — a new page load starts disarmed. This is the real gate; the
 * stored stage, the one-shot behaviour and the expiry are conveniences on top
 * of it, and none of them would stop a stale setting on their own.
 */
let armed = false;

export function armSimulator(on: boolean): void {
  armed = on;
}

export function readFailConfig(): FailConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return OFF;
    const cfg = JSON.parse(raw) as FailConfig;
    if (!cfg?.stage) return OFF;
    // An abandoned setting must not outlive the session that made it.
    if (!cfg.setAt || Date.now() - cfg.setAt > EXPIRY_MS) {
      localStorage.removeItem(KEY);
      return OFF;
    }
    return cfg;
  } catch {
    return OFF;
  }
}

export function writeFailConfig(cfg: Omit<FailConfig, "setAt">): void {
  try {
    if (!cfg.stage) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ ...cfg, setAt: Date.now() }));
  } catch { /* private mode — the simulator simply does nothing */ }
}

/**
 * Should this stage fail right now?
 *
 * Consumes a one-shot setting, so the retry that follows runs for real — which
 * is the half of every scenario that proves recovery works rather than just
 * that failure was survived.
 */
export function takeFailure(stage: FailStage): boolean {
  // The stored setting alone is not a gate. Nothing can fail an upload unless
  // a component holding the QA prop has armed the simulator for this page, so
  // a value left in localStorage cannot reach into the live Camera tab.
  if (!armed) return false;
  const cfg = readFailConfig();
  if (cfg.stage !== stage) return false;
  if (cfg.once) writeFailConfig({ stage: null, once: true });
  return true;
}

/** The error a simulated failure throws, carrying the stage it happened at. */
export function failureError(stage: FailStage): Error & { stage: FailStage; simulated: true } {
  const err = new Error(
    `Simulated failure: the upload stopped ${STAGE_LABELS[stage]}.`,
  ) as Error & { stage: FailStage; simulated: true };
  err.stage = stage;
  err.simulated = true;
  return err;
}
