"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ChevronDown, LogOut, ShieldCheck, Video } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SCHEDULE_MEET_EVENT } from "@/components/meetings/meetings";
import { useAuth } from "@/providers/supabase-provider";
import { SignOutGuard } from "@/components/recovery/sign-out-guard";
import { useAccount, type Account } from "@/lib/hooks/use-account";
import { UPGRADE_HREF } from "@/lib/access";
import { track } from "@/lib/track";

/**
 * The page names across the top bar, on computers (2026-10-14, at the owner's
 * ask). The side menu that held them is now only the phone menu.
 *
 * Each name has the narrowest screen it shows on; whatever does not fit at
 * the current width is under More instead, so the bar never wraps.
 * "Affiliate" keeps its own place: the owner is about to promote it.
 */
type NavItem = { href: string; label: string; from: "md" | "lg" | "xl" };

const PAID_NAV: NavItem[] = [
  { href: "/create", label: "Spark Studio", from: "md" },
  { href: "/videos", label: "My Sparks", from: "md" },
  // Weekly Autopilot's review screen (2026-10-21).
  { href: "/autosparks", label: "AutoSparks", from: "lg" },
  { href: "/tools", label: "Spark Tools", from: "md" },
  { href: "/calendar", label: "Spark Calendar", from: "lg" },
  { href: "/analytics", label: "Spark Insights", from: "lg" },
  { href: "/affiliate", label: "Affiliate", from: "xl" },
  { href: "/settings", label: "Settings", from: "xl" },
  // Just before How It Works (2026-10-28, the owner's brief).
  { href: "/whats-new", label: "What's New", from: "xl" },
  { href: "/help", label: "How It Works", from: "xl" },
];

/**
 * A free account's shorter menu (2026-10-28): its free video, its Sparks,
 * the update teasers, the overview, Upgrade and Settings. The paid pages
 * also refuse a free account on the server (components/access/feature-gate).
 */
const FREE_NAV: NavItem[] = [
  { href: "/create", label: "Spark Studio", from: "md" },
  { href: "/videos", label: "My Sparks", from: "md" },
  { href: "/whats-new", label: "What's New", from: "md" },
  { href: "/help", label: "How It Works", from: "lg" },
  { href: "/settings", label: "Settings", from: "lg" },
  { href: UPGRADE_HREF, label: "Upgrade", from: "md" },
];

/** Until the plan is known: only what both menus share, so nothing flashes. */
const LOADING_NAV: NavItem[] = PAID_NAV.filter((i) => i.href === "/create" || i.href === "/videos");

export function navItemsFor(account: Account | null): NavItem[] {
  if (!account) return LOADING_NAV;
  return account.paid ? PAID_NAV : FREE_NAV;
}

const SHOW: Record<string, string> = { md: "hidden md:flex", lg: "hidden lg:flex", xl: "hidden xl:flex" };
const IN_MORE: Record<string, string> = { md: "md:hidden", lg: "lg:hidden", xl: "xl:hidden" };

const PLAN_LABELS: Record<string, string> = {
  free: "Free plan", beta: "Beta access", starter: "Creator plan", agent: "Producer plan", pro: "Influencer plan",
};

/** The gold dot beside What's New while there is an update not yet seen. */
function NewDot() {
  return (
    <>
      <span aria-hidden="true" className="ml-1 inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-spark-amber" />
      <span className="sr-only"> (new)</span>
    </>
  );
}

/** Closes a menu on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

export function TopNav({ dark }: { dark: boolean }) {
  const pathname = usePathname();
  const account = useAccount();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useDismiss(moreOpen, () => setMoreOpen(false));
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  // The calendar this account can open: see the note in sidebar.tsx.
  const base = navItemsFor(account);
  const items = account?.campaignCalendar
    ? base.map((i) => (i.href === "/calendar" ? { ...i, href: "/campaigns" } : i))
    : base;
  const unread = (href: string) => href === "/whats-new" && !!account?.whatsNewUnread;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // The page you are on is underlined just under its name (2026-10-15). The
  // line used to sit on the bar's bottom edge, where it met the progress
  // rail a pixel off and read as a crooked line under the logo.
  const link = (on: boolean) => cn(
    // px-2 and 14px since 2026-10-22, to fit the bar on a laptop at 100%.
    "items-center whitespace-nowrap px-2 py-[12px] text-[14px] font-medium transition-colors",
    on
      ? cn("underline decoration-spark-amber decoration-2 underline-offset-[7px]", dark ? "text-white" : "text-spark-ink")
      : (dark ? "text-spark-paper/70 hover:text-white" : "text-spark-ink-muted hover:text-spark-ink"),
  );

  return (
    <nav aria-label="Main" className="hidden min-w-0 items-center md:flex">
      {items.map((i) => (
        i.href === UPGRADE_HREF ? (
          // Upgrade, for free accounts: a small gold button, not a page name.
          <Link
            key={i.href}
            href={i.href}
            onClick={() => track("locked_feature_upgrade_clicked")}
            className={cn(SHOW[i.from], "ml-1 items-center whitespace-nowrap rounded-full bg-spark-amber px-3 py-1 text-[13.5px] font-semibold text-white hover:opacity-90")}
          >
            {i.label}
          </Link>
        ) : (
          <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? "page" : undefined} className={cn(SHOW[i.from], link(isActive(i.href)))}>
            {i.label}
            {unread(i.href) && <NewDot />}
          </Link>
        )
      ))}
      <div ref={moreRef} className={cn(
        "relative",
        // More only at the widths where something is folded into it.
        items.some((i) => i.from === "xl") ? "xl:hidden" : items.some((i) => i.from === "lg") ? "lg:hidden" : "hidden",
      )}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(link(items.some((i) => i.from !== "md" && isActive(i.href))), "flex gap-1")}
        >
          More <ChevronDown size={13} />
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 flex min-w-[180px] flex-col rounded-xl border border-spark-rule bg-white py-1.5 shadow-lg">
            {items.filter((i) => i.from !== "md").map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={cn(
                  IN_MORE[i.from],
                  "px-3.5 py-2 text-[14.5px] font-medium",
                  isActive(i.href) ? "text-[#A3660F]" : "text-spark-ink-soft hover:bg-spark-amber-tint",
                )}
              >
                {i.label}
                {unread(i.href) && (
                  <span className="ml-2 rounded-full bg-spark-amber px-1.5 py-px text-[10px] font-bold text-white">NEW</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}

/**
 * The initial at the end of the bar, now a menu: the email, the plan, Admin
 * for admins, and Sign Out, which lived at the foot of the side menu.
 */
/**
 * Google Meet, now or later (2026-10-20, the owner's ask). Both open in a new
 * tab under the agent's own Google account and need no permission from us:
 * meet.new starts a call at once; a new Google Calendar event is how a call is
 * scheduled, and Calendar attaches the Meet link and sends the invite.
 */
export const MEET_NOW_URL = "https://meet.new";

export function MeetMenu({ dark }: { dark: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const item = "flex items-center gap-2 px-3.5 py-2 text-[13px] text-spark-ink-soft hover:bg-spark-amber-tint";
  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Google Meet"
        className={cn(
          "flex items-center gap-1.5 text-[13px] font-medium transition-colors",
          dark ? "text-spark-paper/80 hover:text-white" : "text-spark-ink-muted hover:text-spark-ink",
        )}
      >
        <Video size={16} strokeWidth={1.8} /> Meet <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[200px] rounded-xl border border-spark-rule bg-white py-2 shadow-lg">
          <a href={MEET_NOW_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            <Video size={14} /> Start now
          </a>
          {/* SparkReels' own box first, so the meeting is in Spark Calendar;
              it then opens Google Calendar filled in (components/meetings). */}
          <button
            type="button"
            onClick={() => { setOpen(false); window.dispatchEvent(new Event(SCHEDULE_MEET_EVENT)); }}
            className={cn(item, "w-full text-left")}
          >
            <CalendarPlus size={14} /> Schedule for later
          </button>
        </div>
      )}
    </div>
  );
}

export function AccountMenu({ dark }: { dark: boolean }) {
  const { user } = useAuth();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const formRef = useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account"
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
          dark ? "bg-spark-blue text-spark-paper" : "bg-[#e3d5bb] text-spark-ink",
        )}
      >
        {user?.email?.[0]?.toUpperCase() ?? "U"}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[240px] rounded-xl border border-spark-rule bg-white py-2 shadow-lg">
          <div className="px-3.5 pb-2">
            <p className="truncate text-[12.5px] font-medium text-spark-ink">{user?.email}</p>
            <p className="text-[11.5px] text-spark-ink-faint">
              {!account ? " " : account.isAdmin ? (account.isStaff ? "Staff" : "Admin-Unlimited") : (PLAN_LABELS[account.tier] ?? `${account.tier} plan`)}
            </p>
          </div>
          {account?.isRealAdmin && (
            <Link href="/admin" className="flex items-center gap-2 px-3.5 py-2 text-[13px] text-spark-ink-soft hover:bg-spark-amber-tint">
              <ShieldCheck size={14} /> Admin
            </Link>
          )}
          {/* The same form POST the side menu used: the route clears the auth
              cookies itself. The guard holds it while a recording is still
              waiting on this device. */}
          <form ref={formRef} action="/api/auth/logout" method="POST">
            <SignOutGuard onProceed={() => formRef.current?.submit()} trigger={(requestSignOut) => (
              <button
                type="button"
                onClick={requestSignOut}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-spark-ink-muted hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={14} /> Sign Out
              </button>
            )} />
          </form>
        </div>
      )}
    </div>
  );
}
