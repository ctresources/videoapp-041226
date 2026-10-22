"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ChevronDown, LogOut, ShieldCheck, Video } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { SCHEDULE_MEET_EVENT } from "@/components/meetings/meetings";
import { useAuth } from "@/providers/supabase-provider";
import { SignOutGuard } from "@/components/recovery/sign-out-guard";

/**
 * The page names across the top bar, on computers (2026-10-14, at the owner's
 * ask). The side menu that held them is now only the phone menu.
 *
 * Each name has the narrowest screen it shows on; whatever does not fit at
 * the current width is under More instead, so the bar never wraps.
 * "Affiliate" keeps its own place: the owner is about to promote it.
 */
const NAV: { href: string; label: string; from: "md" | "lg" | "xl" }[] = [
  { href: "/create", label: "Spark Studio", from: "md" },
  { href: "/videos", label: "My Sparks", from: "md" },
  // Weekly Autopilot's review screen (2026-10-21).
  { href: "/autosparks", label: "AutoSparks", from: "lg" },
  { href: "/tools", label: "Spark Tools", from: "md" },
  { href: "/calendar", label: "Spark Calendar", from: "lg" },
  { href: "/analytics", label: "Spark Insights", from: "lg" },
  { href: "/affiliate", label: "Affiliate", from: "xl" },
  { href: "/settings", label: "Settings", from: "xl" },
  { href: "/help", label: "How It Works", from: "xl" },
];
const SHOW: Record<string, string> = { md: "hidden md:flex", lg: "hidden lg:flex", xl: "hidden xl:flex" };
const IN_MORE: Record<string, string> = { md: "md:hidden", lg: "lg:hidden", xl: "xl:hidden" };

const PLAN_LABELS: Record<string, string> = {
  free: "Free plan", beta: "Beta access", starter: "Creator plan", agent: "Producer plan", pro: "Influencer plan",
};

interface Account { isAdmin: boolean; tier: string; campaignCalendar: boolean }

function useAccount(): Account | null {
  const { user } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    if (!user) return;
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a && setAccount({ isAdmin: !!a.isAdmin, tier: a.tier ?? "free", campaignCalendar: !!a.campaignCalendar }))
      .catch(() => {});
  }, [user]);
  return account;
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
  const items = account?.campaignCalendar
    ? NAV.map((i) => (i.href === "/calendar" ? { ...i, href: "/campaigns" } : i))
    : NAV;
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
        <Link key={i.href} href={i.href} aria-current={isActive(i.href) ? "page" : undefined} className={cn(SHOW[i.from], link(isActive(i.href)))}>
          {i.label}
        </Link>
      ))}
      <div ref={moreRef} className="relative xl:hidden">
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
              {!account ? " " : account.isAdmin ? "Admin-Unlimited" : (PLAN_LABELS[account.tier] ?? `${account.tier} plan`)}
            </p>
          </div>
          {account?.isAdmin && (
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
