/**
 * BoldTrail's contact statuses and types (2026-11-25, the owner's ask: pick
 * people by Status and Type). Plain data, so the people box in the browser
 * and lib/api/boldtrail.ts on the server read the same lists. Codes read off
 * apidocs.kvcore.com: filter[status][] takes the number, filter[leadtype][]
 * the word.
 */
export const BT_STATUSES: readonly { code: number; label: string }[] = [
  { code: 0, label: "New" },
  { code: 1, label: "Client" },
  { code: 2, label: "Closed" },
  { code: 3, label: "Sphere" },
  { code: 4, label: "Active" },
  { code: 5, label: "Under contract" },
  { code: 7, label: "Prospect" },
];
export const BT_TYPES: readonly string[] = ["buyer", "seller", "renter", "agent", "vendor"];

export type BtFilter = { status?: number | null; type?: string | null };
export type FoundContact = { id: string; name: string; email: string; status?: string; type?: string };

/** A status code or word, as the label shown in the app, or null. */
export function statusLabel(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return BT_STATUSES.find((s) => s.code === n)?.label ?? null;
  const w = String(v).trim().toLowerCase();
  return BT_STATUSES.find((s) => s.label.toLowerCase() === w || (w === "contract" && s.code === 5))?.label ?? null;
}

/** "seller" → "Seller"; anything else that isn't a known type → null. */
export function typeLabel(v: unknown): string | null {
  const w = String(v ?? "").trim().toLowerCase();
  return BT_TYPES.includes(w) ? w[0].toUpperCase() + w.slice(1) : null;
}

/** "Closed · Seller", "Closed", "Seller" or "". */
export function contactTag(c: { status?: string; type?: string }): string {
  return [c.status, c.type].filter(Boolean).join(" · ");
}

/** Only a filter value we know: a listed status code and a listed type. */
export function cleanFilter(f: { status?: unknown; type?: unknown } | null | undefined): BtFilter {
  const n = f?.status === "" || f?.status === null || f?.status === undefined ? NaN : Number(f.status);
  const t = String(f?.type ?? "").trim().toLowerCase();
  return {
    status: BT_STATUSES.some((s) => s.code === n) ? n : null,
    type: BT_TYPES.includes(t) ? t : null,
  };
}

export function hasFilter(f: BtFilter): boolean {
  return (f.status !== null && f.status !== undefined) || !!f.type;
}

/**
 * Whether a contact BoldTrail returned really is what was asked for. Checked
 * on our side as well, so a filter BoldTrail ignored can never put the wrong
 * people on the list. A row that doesn't say its status or type is taken on
 * BoldTrail's word.
 */
export function matchesFilter(c: Record<string, unknown>, f: BtFilter): boolean {
  if (f.status !== null && f.status !== undefined && c.status !== undefined && c.status !== null && c.status !== "") {
    if (statusLabel(c.status) !== statusLabel(f.status)) return false;
  }
  if (f.type) {
    const raw = c.deal_type ?? c.leadtype ?? c.lead_type ?? c.type;
    if (raw !== undefined && raw !== null && raw !== "") {
      const words = String(raw).toLowerCase().split(/[^a-z]+/).filter(Boolean);
      if (!words.includes(f.type)) return false;
    }
  }
  return true;
}
