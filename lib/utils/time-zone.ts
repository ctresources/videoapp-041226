/**
 * Time zone helpers for the campaign calendar, built on Intl.
 *
 * Every date on the calendar is shown, and every schedule is set, in the
 * user's own zone — not the browser's, which can differ when travelling, and
 * not the server's, which is UTC. date-fns v4 leaves zones to a separate
 * package this app does not carry; Intl already knows every IANA zone, so
 * these few helpers are all the calendar needs.
 *
 * Calendar days are handled as "YYYY-MM-DD" keys. Arithmetic on those keys is
 * done in UTC, where a day is always 24 hours, so a DST change can never make
 * a grid skip or repeat a day.
 */

export const DEFAULT_TIME_ZONE = "America/New_York";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** The wall-clock reading of `date` in `tz`. */
export function zonedParts(date: Date, tz: string): ZonedParts {
  const out: Record<string, string> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    // Some engines still print midnight as "24" even with h23.
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
  };
}

export function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The calendar day `date` falls on in `tz`, as "YYYY-MM-DD". */
export function dayKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return ymd(p.year, p.month, p.day);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The instant a wall-clock date and time names in `tz` — "9:00 on the 18th,
 * New York time" — whatever zone the browser happens to be in. Two passes
 * settle the offset when the guess lands across a DST change.
 */
export function zonedToUtc(dateKey: string, time: string, tz: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  }
  return new Date(guess);
}

export function formatInZone(date: Date, tz: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, ...opts }).format(date);
}

/** "9:00a" / "5:30p" — the compact time the calendar design uses. */
export function shortTime(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  const h = p.hour % 12 || 12;
  return `${h}:${String(p.minute).padStart(2, "0")}${p.hour < 12 ? "a" : "p"}`;
}

/** Offered first in Settings: most users are in one of these. */
export const US_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

/** Every zone the browser knows, where it can list them. */
export function allTimeZones(): string[] {
  const list = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  try {
    return list ? list("timeZone") : [];
  } catch {
    return [];
  }
}
