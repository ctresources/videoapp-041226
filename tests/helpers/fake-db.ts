import { vi } from "vitest";

/**
 * A tiny stand-in for the Supabase client in parity tests. Each table returns
 * the row(s) set in `rows`; every select/update/insert is recorded so a test
 * can check what a service read and wrote. Filters are recorded, not applied.
 */
export function fakeDb(rows: Record<string, unknown> = {}) {
  const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];

  function builder(table: string, op: string, payload?: unknown) {
    const call = { table, op, payload, filters: [] as [string, unknown][] };
    calls.push(call);
    const row = rows[table];
    const result = { data: Array.isArray(row) ? row : row ?? null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "gte", "lt", "neq", "in", "is"]) b[m] = () => b;
    b.eq = (col: string, val: unknown) => { call.filters.push([col, val]); return b; };
    b.maybeSingle = async () => ({ data: Array.isArray(row) ? row[0] ?? null : row ?? null, error: null });
    b.single = b.maybeSingle;
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej);
    return b;
  }

  const db = {
    from: vi.fn((table: string) => ({
      select: () => builder(table, "select"),
      update: (payload: unknown) => builder(table, "update", payload),
      insert: (payload: unknown) => builder(table, "insert", payload),
      upsert: (payload: unknown) => builder(table, "upsert", payload),
    })),
  };
  return { db, calls };
}
