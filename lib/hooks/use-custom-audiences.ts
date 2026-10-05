"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  cleanAudienceList,
  cleanAudienceName,
  knownAudience,
  withAudience,
} from "@/lib/utils/audiences";

/**
 * Where the list lived before it was on the account: one key for the whole
 * browser, whoever was signed in. Read once, carried up to the account, then
 * removed.
 */
const LEGACY_KEY = "spark_custom_audiences";
const keyFor = (userId: string) => `${LEGACY_KEY}:${userId}`;

function readLocal(key: string): string[] {
  try {
    return cleanAudienceList(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return []; // private mode, or a corrupt entry
  }
}

function writeLocal(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* private mode */ }
}

// One copy for the page, so every picker on it shows the same list and a name
// added in one appears in the others. Keyed by user: signing in as someone
// else in the same tab must not show, or save, the last person's audiences.
let store: { userId: string; list: string[] } | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<(list: string[]) => void>();

function publish(userId: string, list: string[]) {
  store = { userId, list };
  writeLocal(keyFor(userId), list);
  listeners.forEach((l) => l(list));
}

async function saveToAccount(userId: string, list: string[]) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ custom_audiences: list }).eq("id", userId);
  // Not worth interrupting anyone over: the name is still in this browser and
  // is offered to the account again on the next load.
  if (error) console.warn("[audiences] could not save to the account:", error.message);
}

async function load() {
  const supabase = createClient();
  // The session, not getUser(): this only decides whose list to show, and the
  // database decides whose row can be read or written. getUser() is a network
  // call, and this runs for every picker that mounts.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;
  if (store?.userId === user.id) return;

  // What this browser already knew, shown at once.
  const legacy = readLocal(LEGACY_KEY);
  const local = cleanAudienceList([...readLocal(keyFor(user.id)), ...legacy]);
  publish(user.id, local);

  const { data, error } = await supabase
    .from("profiles")
    .select("custom_audiences")
    .eq("id", user.id)
    .single();
  if (error) return; // keep the browser's own list; nothing is lost

  const account = cleanAudienceList((data as { custom_audiences?: unknown } | null)?.custom_audiences);
  // The account's list first, then anything only this browser had: names
  // spoken here before the list was on the account are carried up once.
  // Anything added while the read was in flight is in the store, not `local`.
  const here = store?.userId === user.id ? store.list : local;
  const merged = cleanAudienceList([...account, ...here]);
  publish(user.id, merged);
  if (merged.length !== account.length || merged.some((a, i) => a !== account[i])) {
    await saveToAccount(user.id, merged);
  }
  try { localStorage.removeItem(LEGACY_KEY); } catch { /* private mode */ }
}

/**
 * The audiences this user has named themselves.
 *
 * They used to live in one browser, so "first responders" said on a phone was
 * missing from the picker on a computer. They are on the account now
 * (profiles.custom_audiences); browser storage is only a copy that lets the
 * list show before the account has answered.
 */
export function useCustomAudiences() {
  const [audiences, setAudiences] = useState<string[]>(store?.list ?? []);

  useEffect(() => {
    listeners.add(setAudiences);
    if (store) setAudiences(store.list);
    loading ??= load().catch(() => { /* the built-in audiences still work */ }).finally(() => { loading = null; });
    return () => { listeners.delete(setAudiences); };
  }, []);

  /**
   * Adds a name and returns it as the pickers now know it, or "" when it was
   * not a name. A name that is already known, in any capitals, is returned in
   * its existing spelling and nothing is added.
   */
  const add = useCallback((raw: string): string => {
    const name = cleanAudienceName(raw);
    if (!name) return "";
    const current = store?.list ?? [];
    const known = knownAudience(current, name);
    if (known) return known;
    // Before the account has answered there is no one to save it for yet. The
    // name is still returned, so the picker shows it and this video uses it.
    if (!store) return name;
    const next = withAudience(current, name);
    publish(store.userId, next);
    void saveToAccount(store.userId, next);
    return name;
  }, []);

  return { audiences, add };
}
