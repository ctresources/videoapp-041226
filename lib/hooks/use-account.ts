"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/supabase-provider";
import { isPaidLevel, type AccessLevel } from "@/lib/access";
import { LATEST_WHATS_NEW_ID, WHATS_NEW_SEEN_EVENT } from "@/lib/data/whats-new";

/**
 * The signed-in account as the menus need it: role, plan, free vs paid, and
 * whether there is a What's New update not yet seen.
 *
 * One fetch of /api/profile/allowance shared by the top bar, the account menu
 * and the phone menu (each used to make its own). Showing or hiding a menu
 * item is only convenience; the pages themselves check access on the server.
 */
export interface Account {
  isAdmin: boolean;
  isRealAdmin: boolean;
  isStaff: boolean;
  tier: string;
  campaignCalendar: boolean;
  level: AccessLevel;
  paid: boolean;
  /** Affiliate Program: paid, or canceled but paid through the period. */
  affiliateEligible?: boolean;
  whatsNewUnread: boolean;
}

let cached: Promise<Account | null> | null = null;
let cachedFor: string | null = null;

function load(): Promise<Account | null> {
  return fetch("/api/profile/allowance")
    .then((r) => (r.ok ? r.json() : null))
    .then((a) => {
      if (!a) return null;
      const level = (a.level as AccessLevel | undefined) ?? "free";
      return {
        isAdmin: !!a.isAdmin,
        isRealAdmin: !!a.isRealAdmin,
        isStaff: !!a.isStaff,
        tier: a.tier ?? "free",
        campaignCalendar: !!a.campaignCalendar,
        level,
        paid: isPaidLevel(level),
        affiliateEligible: !!a.affiliateEligible,
        whatsNewUnread: !!LATEST_WHATS_NEW_ID && a.whatsNewSeen !== LATEST_WHATS_NEW_ID,
      };
    })
    .catch(() => null);
}

export function useAccount(): Account | null {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!cached || cachedFor !== user.id) {
      cachedFor = user.id;
      cached = load();
    }
    let live = true;
    cached.then((a) => { if (live) setAccount(a); });

    // Opening What's New clears the dot here and in the shared copy.
    const onSeen = () => {
      cached = (cached ?? Promise.resolve(null)).then((a) => (a ? { ...a, whatsNewUnread: false } : a));
      setAccount((a) => (a ? { ...a, whatsNewUnread: false } : a));
    };
    window.addEventListener(WHATS_NEW_SEEN_EVENT, onSeen);
    return () => { live = false; window.removeEventListener(WHATS_NEW_SEEN_EVENT, onSeen); };
  }, [user]);

  return account;
}
