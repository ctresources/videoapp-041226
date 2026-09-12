"use client";

/**
 * Recordings held on this device until the server confirms it has them.
 *
 * A take exists only in memory between the moment recording stops and the
 * moment the save route returns a video id. Anything in that window — a
 * dropped connection, a closed tab, a phone call, a reload — took the
 * recording with it, and the only honest thing the app could say afterwards
 * was nothing at all.
 *
 * So the blob is written here first and deleted only on confirmed success. On
 * the next visit the recorder offers to finish the upload rather than asking
 * anyone to perform their take again.
 *
 * Several recordings at once, deliberately. A single slot per kind meant a
 * second failed take silently overwrote the first — turning a feature meant to
 * prevent loss into a cause of it.
 *
 * IndexedDB rather than localStorage: this holds video, far past what
 * localStorage can take, and IndexedDB stores a Blob as a Blob rather than a
 * base64 string a third larger again.
 *
 * Nothing here logs a blob, a title or a script. A recording is the user's
 * words and face, and a console is not private.
 */

const DB_NAME = "sparkreels";
const STORE = "recoveries";
const DB_VERSION = 2;

export type RecoveryKind = "camera" | "voice-sample";

/**
 * `uploading` is written before the attempt, so a tab that dies mid-upload is
 * found in that state next time rather than looking untouched.
 */
export type RecoveryStatus = "pending" | "uploading" | "failed";

export interface RecoveryRecord {
  /** Unique per recording, and the idempotency key the server dedupes on. */
  id: string;
  /** Whose recording this is. Never shown to anyone else on this browser. */
  userId: string;
  kind: RecoveryKind;
  /** The Spark or project it belongs to, when that is known yet. */
  projectId: string | null;
  blob: Blob;
  title: string;
  script: string;
  /** The shape the server should file it as. */
  videoType?: string;
  /** Real recorded pixels, so a retry files the same shape the take really is. */
  width: number | null;
  height: number | null;
  mimeType: string;
  extension: string;
  createdAt: number;
  status: RecoveryStatus;
  attempts: number;
  lastError: string | null;
  /**
   * Where the last attempt stopped, when the failure said so.
   *
   * "It failed" and "it failed after the file was already in storage" call for
   * different things, and the second one is the case worth recognising.
   */
  lastStage?: string | null;
}

/** What is stored: the blob lives beside the rest rather than inside it. */
type StoredRecord = RecoveryRecord;

/**
 * Where records go when IndexedDB will not have them.
 *
 * Private browsing, a full disk, an origin with site data blocked. The
 * recording is still in memory and the page can still offer to download or
 * retry it — but only while this page stays open, which is the one thing the
 * caller must say out loud rather than let the user assume.
 */
const memoryFallback = new Map<string, RecoveryRecord>();

/** True when the last write had to fall back to memory. */
export function isMemoryOnly(id: string): boolean {
  return memoryFallback.has(id);
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 held one row per kind under a different key path. Nothing shipped
      // against it, so it is replaced rather than migrated.
      if (db.objectStoreNames.contains("pending-uploads")) {
        db.deleteObjectStore("pending-uploads");
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    // Another tab holding an older version open would otherwise hang this
    // promise, and with it whatever is waiting to record.
    req.onblocked = () => resolve(null);
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<{ ok: true; value: T } | { ok: false }> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve({ ok: true, value: req.result as T });
      // Quota exceeded lands here. The caller carries on regardless.
      req.onerror = () => resolve({ ok: false });
      tx.onabort = () => resolve({ ok: false });
    } catch {
      resolve({ ok: false });
    }
  });
}

/** A recovery id, which doubles as the server's idempotency key. */
export function newRecoveryId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  // Older Safari. Not cryptographic — it only has to be unique per device.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether there is plausibly room for a recording this size.
 *
 * Advisory only. `estimate()` is a hint, not a reservation, and a browser may
 * refuse a write that fits or accept one that does not — so a "no" here skips
 * a doomed multi-hundred-megabyte write rather than deciding anything.
 */
async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return true;
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== "number" || typeof usage !== "number") return true;
    // A margin, because the estimate is rounded and other data shares the box.
    return quota - usage > bytes * 1.1;
  } catch {
    return true;
  }
}

/**
 * Ask the browser not to evict this origin's storage under pressure.
 *
 * Chrome grants it silently to an engaged origin; Safari does not have it at
 * all. Asked for once, never relied on: a recording is offered back because it
 * is there, not because persistence was promised.
 */
async function requestPersistence(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return;
    if (await navigator.storage.persisted?.()) return;
    await navigator.storage.persist();
  } catch { /* best effort */ }
}

/**
 * Write a record, returning whether the device actually took it.
 *
 * `false` means the recording exists only in this page's memory — the caller
 * must say so rather than let the user believe it is safe to leave.
 */
export async function putRecovery(rec: RecoveryRecord): Promise<boolean> {
  if (!rec.userId) {
    // Without an owner it could be offered to the next person to sign in here.
    memoryFallback.set(rec.id, rec);
    return false;
  }

  const room = await hasRoomFor(rec.blob.size);
  if (!room) {
    memoryFallback.set(rec.id, rec);
    return false;
  }

  void requestPersistence();

  const db = await openDb();
  if (!db) {
    memoryFallback.set(rec.id, rec);
    return false;
  }
  const res = await run<IDBValidKey>(db, "readwrite", (s) => s.put(rec as StoredRecord));
  db.close();
  if (!res.ok) {
    memoryFallback.set(rec.id, rec);
    return false;
  }
  memoryFallback.delete(rec.id);
  return true;
}

/** Update the bookkeeping on a record without rewriting its blob needlessly. */
export async function updateRecovery(
  id: string,
  patch: Partial<Pick<RecoveryRecord, "status" | "attempts" | "lastError" | "lastStage" | "projectId">>,
): Promise<void> {
  const inMemory = memoryFallback.get(id);
  if (inMemory) {
    memoryFallback.set(id, { ...inMemory, ...patch });
    return;
  }
  const db = await openDb();
  if (!db) return;
  const got = await run<StoredRecord | undefined>(db, "readonly", (s) => s.get(id));
  if (got.ok && got.value) {
    await run(db, "readwrite", (s) => s.put({ ...got.value!, ...patch }));
  }
  db.close();
}

/**
 * Every recording still waiting, for this user only.
 *
 * Scoped by user id rather than filtered in the UI: a shared computer is the
 * normal case for an office, and one agent's unfinished take must never be
 * offered to — or uploaded by — the next person to sign in.
 */
export async function listRecoveries(
  userId: string,
  kind?: RecoveryKind,
): Promise<RecoveryRecord[]> {
  if (!userId) return [];

  const fromMemory = Array.from(memoryFallback.values())
    .filter((r) => r.userId === userId && (!kind || r.kind === kind));

  const db = await openDb();
  let stored: RecoveryRecord[] = [];
  if (db) {
    const res = await run<StoredRecord[]>(db, "readonly", (s) => s.getAll());
    db.close();
    if (res.ok && Array.isArray(res.value)) {
      stored = res.value.filter(
        (r) =>
          r.userId === userId &&
          (!kind || r.kind === kind) &&
          // A blob that survived the write but not the read (site data cleared
          // mid-session) would offer a retry with no file behind it.
          r.blob instanceof Blob && r.blob.size > 0,
      );
    }
  }

  const seen = new Set(fromMemory.map((r) => r.id));
  return [...fromMemory, ...stored.filter((r) => !seen.has(r.id))]
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Remove a record — on confirmed upload, or because the user asked. */
export async function deleteRecovery(id: string): Promise<void> {
  memoryFallback.delete(id);
  const db = await openDb();
  if (!db) return;
  await run(db, "readwrite", (s) => s.delete(id));
  db.close();
}

/** "3 minutes ago", for a notice offering to finish an interrupted upload. */
export function describeAge(createdAt: number): string {
  const mins = Math.round((Date.now() - createdAt) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "a minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours === 1) return "an hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "48 MB", for saying what is waiting without opening it. */
export function describeSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${Math.round(mb)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Save a held recording to the user's own disk, whatever else happens. */
export function downloadRecovery(rec: RecoveryRecord): void {
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(rec.title || "recording").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "recording"}.${rec.extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked late: Safari cancels the download if the URL dies too soon.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
