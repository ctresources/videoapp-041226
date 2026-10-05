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
// Names removed since the page opened, in lower case. A read of the account
// that was already in flight still carries them, and must not put them back.
const removed = new Set<string>();
const listeners = new Set<(list: string[]) => void>();

function publish(userId: string, list: string[]) {
  store = { userId, list };
  writeLocal(keyFor(userId), list);
  listeners.forEach((l) => l(list));
}

async function saveToAccount(userId: string, list: string[]) {
  const supabase = createClient();
  const { error } = await supabase.from("profiles").update({ custom_audiences: list }).eq("id", userId);
  // Not worth interrupting anyone over: this video still uses the name, and
  // the picker shows it until the page is next opened.
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

  // What this browser last showed, at once, so the picker is not empty while
  // the account answers.
  const legacy = readLocal(LEGACY_KEY);
  const shown = cleanAudienceList([...readLocal(keyFor(user.id)), ...legacy]);
  publish(user.id, shown);

  const { data, error } = await supabase
    .from("profiles")
    .select("custom_audiences")
    .eq("id", user.id)
    .single();
  if (error) return; // keep what the browser had; nothing is lost

  const account = cleanAudienceList((data as { custom_audiences?: unknown } | null)?.custom_audiences);
  // The account is the list. Two things are added to it: what the old
  // browser-wide key held, carried up this once, and anything typed while the
  // read was in flight. The browser's own copy is NOT merged back in: if it
  // were, a name removed on a phone would return from the computer's copy the
  // next time that computer opened the page.
  const during = (store?.userId === user.id ? store.list : []).filter((a) => !shown.includes(a));
  const merged = cleanAudienceList([...account, ...legacy, ...during])
    .filter((a) => !removed.has(a.toLowerCase()));
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
    removed.delete(name.toLowerCase());
    const next = withAudience(current, name);
    publish(store.userId, next);
    void saveToAccount(store.userId, next);
    return name;
  }, []);

  /** Takes a name off the list, here and on the account. The built-in ones are not on it. */
  const remove = useCallback((raw: string) => {
    const key = cleanAudienceName(raw).toLowerCase();
    if (!key || !store) return;
    removed.add(key);
    const next = store.list.filter((a) => a.toLowerCase() !== key);
    if (next.length === store.list.length) return;
    publish(store.userId, next);
    void saveToAccount(store.userId, next);
  }, []);

  return { audiences, add, remove };
}
