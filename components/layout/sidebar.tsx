"use client";

import { cn } from "@/lib/utils/cn";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarPlus, ChevronDown, LogOut, ShieldCheck, Video } from "lucide-react";
import { MEET_NOW_URL, navItemsFor } from "@/components/layout/top-nav";
import { useAccount } from "@/lib/hooks/use-account";
import { UPGRADE_HREF } from "@/lib/access";
import { SCHEDULE_MEET_EVENT } from "@/components/meetings/meetings";
import { useAuth } from "@/providers/supabase-provider";
import { useCreateProgress } from "@/components/layout/create-progress";
import { SignOutGuard } from "@/components/recovery/sign-out-guard";
import { ASK_SPARKLEE_EVENT } from "@/components/layout/ask-sparklee";
import { Fragment, useRef, useState, type ReactNode } from "react";

// Icon geometry is lifted verbatim from the design handoff's assets/nav-items.json
// rather than swapped for lucide equivalents — the set is drawn on a 24px grid at
// 1.7 stroke and the mismatch shows at 15px, which is where these render.
const NAV_ICONS: Record<string, ReactNode> = {
  "/dashboard": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  "/create": (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.5" />
    </>
  ),
  "/videos": (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 11l6-3.5v9l-6-3.5z" />
    </>
  ),
  "/tools": (
    <>
      <path d="M4 20l11-11" />
      <path d="M14 5l5 5" />
      <path d="M18.5 2.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  "/calendar": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  // Same glyph under the new path. This map is keyed by href and read as
  // NAV_ICONS[href], so once Spark Calendar points at /campaigns for granted
  // accounts there has to be an entry here — otherwise the lookup returns
  // undefined and that row renders an empty svg, for the two people who can
  // see the page and nobody else. Record<string, ReactNode> makes an unknown
  // key legal, so the compiler says nothing about it.
  "/campaigns": (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  "/analytics": <path d="M5 20V11M12 20V4M19 20v-6" />,
  "/social": (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4" />
    </>
  ),
  "/billing": (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
      <path d="M2.5 10h19" />
    </>
  ),
  // Weekly Autopilot (2026-10-21): a spark.
  "/autosparks": (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  "/affiliate": (
    <>
      <path d="M12 3v18" />
      <path d="M16.5 7.5c0-2-2-3-4.5-3s-4.5 1-4.5 3.2S9.5 10.5 12 11s4.5 1.3 4.5 3.4-2 3.1-4.5 3.1-4.5-1.1-4.5-3" />
    </>
  ),
  "/settings": (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
  "/help": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.3a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.7-.9 1.3v.6" />
      <path d="M12 17.2h.01" />
    </>
  ),
  // What's New (2026-10-28): a bell.
  "/whats-new": (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  // Upgrade, for free accounts: an arrow up.
  [UPGRADE_HREF]: (
    <>
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free plan",
  beta: "Beta access",
  starter: "Creator plan",
  agent: "Producer plan",
  pro: "Influencer plan",
};

// The dashboard layout renders this twice — once inside the mobile drawer and
// once as the desktop rail. The drawer copy passes mobile so it isn't hidden by
// the desktop-only breakpoint.
export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  // The Google Meet row's two choices, shown on a tap (2026-10-21: two rows
  // read as the same item twice on the owner's iPhone).
  const [meetOpen, setMeetOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  // Role, plan, free vs paid and the What's New dot (lib/hooks/use-account).
  // The Admin link is shown only to admins, and the plan label is the real one.
  const account = useAccount();
  // Submitted directly rather than by its own button, so the guard can hold
  // the sign-out open while the user retries or downloads.
  const logoutFormRef = useRef<HTMLFormElement>(null);

  // Free accounts get the shorter menu (2026-10-28); same lists as the top bar.
  const navItems = navItemsFor(account);

  /**
   * Spark Calendar points at whichever calendar this account can actually open.
   *
   * /campaigns is the Spark control centre and is still behind feature_access;
   * /calendar is the older scheduler everyone has. Sending every user to the
   * new one would hand a 404 to anyone without the grant — a menu item that
   * looks live and isn't. Defaults to the old page until the grant is known,
   * so nothing flashes from one destination to the other on load.
   *
   * When the calendar opens to everyone this collapses to changing the href in
   * navItems and deleting this block.
   */
  const items = account?.campaignCalendar
    ? navItems.map((i) => (i.href === "/calendar" ? { ...i, href: "/campaigns" } : i))
    : navItems;

  // Set only on the Create page, where the top bar is black (see topbar.tsx).
  const onCreate = useCreateProgress() !== null;

  return (
    <aside
      className={cn(
        "flex-col w-[184px] shrink-0 min-h-screen bg-white border-r border-spark-rule pb-4",
        !onCreate && "pt-4",
        mobile ? "flex" : "hidden md:flex"
      )}
    >
      {/* Logo */}
      {onCreate ? (
        /* On Create the logo sits on black, as it was drawn.
           It is a gold mark made for a dark ground. On white it has to be
           darkened to be read at all, and the owner looked at that darkened
           copy beside the black bar and asked for the real one. So the bar's
           black runs across the top of the sidebar here, the same height as
           the bar and its rail (46px + 3px), and the logo is shown untouched.
           -mr-px covers the sidebar's own right border, which would otherwise
           draw a pale line between the two halves of one header. */
        <div className="-mr-px mb-3 flex h-[49px] items-center justify-center bg-[#050505]">
          <Link href="/create">
            <Image
              src="/sparkreels-logo-dark.png"
              alt="SparkReels.ai — Speak. Spark. Share."
              width={180}
              height={36}
              className="block h-[36px] w-[180px] object-contain"
              unoptimized
              priority
            />
          </Link>
        </div>
      ) : (
      <div className="px-4 pb-4">
        <Link href="/create">
          {/* The new logo's light-background copy (2026-10-16), so no
              darkening filter is needed any more. */}
          <Image
            src="/sparkreels-logo-light.png"
            alt="SparkReels.ai — Speak. Spark. Share."
            width={190}
            height={38}
            className="block h-[38px] w-[190px] object-contain"
            unoptimized
            priority
          />
        </Link>
      </div>
      )}

      {/* Ask Sparklee, first in the phone menu (2026-10-18, the owner's
          mockup): the box was too big for a phone's top bar. Starts the same
          conversation and closes the menu. */}
      {mobile && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("spark:close-menu"));
            window.dispatchEvent(new Event(ASK_SPARKLEE_EVENT));
          }}
          className="mx-2 mb-3 flex items-center gap-2 rounded-xl bg-[#0f0d0b] py-1.5 pl-1.5 pr-2.5 text-left"
        >
          <span className="sparklee-badge block h-[32px] w-[32px] shrink-0">
            <Image src="/sparklee.webp" alt="" width={32} height={32} className="h-full w-full" unoptimized />
          </span>
          <span className="leading-tight">
            <span className="block bg-gradient-to-b from-[#ffe39a] via-[#e7a92c] to-[#b9780f] bg-clip-text font-display text-[14px] font-bold text-transparent">
              Ask Sparklee
            </span>
            <span className="block text-[10.5px] text-[#f3e6cf]">Need help? Just ask her.</span>
          </span>
        </button>
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-px px-2">
        {items.map(({ href, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Fragment key={href}>
            {/* Start a Google Meet, just above Settings (2026-10-20, the
                owner's ask). meet.new starts a fresh Meet under whoever is
                signed in to Google, in a new tab: Google doesn't let Meet run
                inside another site, and this needs no setup or permission. */}
            {href === "/settings" && (
              <>
              <button
                type="button"
                onClick={() => setMeetOpen((v) => !v)}
                aria-expanded={meetOpen}
                className="flex w-full items-center gap-2.5 rounded-nav px-2.5 py-2 text-left text-[12.5px] font-normal text-spark-ink-soft transition-colors hover:bg-spark-amber-tint"
              >
                <Video size={15} strokeWidth={1.7} color="#8b8779" className="flex-none" aria-hidden="true" />
                <span className="flex-1">Google Meet</span>
                <ChevronDown size={14} className={cn("text-[#8b8779] transition-transform", meetOpen && "rotate-180")} />
              </button>
              {meetOpen && (
                <div className="ml-7 flex flex-col">
                  <a
                    href={MEET_NOW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMeetOpen(false)}
                    className="rounded-nav px-2.5 py-1.5 text-[12.5px] text-spark-ink-soft hover:bg-spark-amber-tint"
                  >
                    Start now
                  </a>
                  {/* Later, through SparkReels' Schedule box (2026-10-20). */}
                  <button
                    type="button"
                    onClick={() => {
                      setMeetOpen(false);
                      window.dispatchEvent(new Event("spark:close-menu"));
                      window.dispatchEvent(new Event(SCHEDULE_MEET_EVENT));
                    }}
                    className="flex items-center gap-1.5 rounded-nav px-2.5 py-1.5 text-left text-[12.5px] text-spark-ink-soft hover:bg-spark-amber-tint"
                  >
                    <CalendarPlus size={13} strokeWidth={1.7} color="#8b8779" aria-hidden="true" /> Schedule for later
                  </button>
                </div>
              )}
              </>
            )}
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-nav px-2.5 py-2 text-[12.5px] transition-colors",
                active
                  ? "bg-spark-amber font-medium text-white"
                  : "font-normal text-spark-ink-soft hover:bg-spark-amber-tint"
              )}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke={active ? "#fff" : "#8b8779"}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-none"
                aria-hidden="true"
              >
                {NAV_ICONS[href]}
              </svg>
              <span>{label}</span>
              {href === "/whats-new" && account?.whatsNewUnread && (
                <span className="ml-auto rounded-full bg-spark-amber px-1.5 py-px text-[10px] font-bold text-white">NEW</span>
              )}
            </Link>
            </Fragment>
          );
        })}

        {/* Admin link — actually only for admins now. Hidden until the role is
            known, so it never flashes in for a regular user on load. */}
        {account?.isRealAdmin && (
          <Link
            href="/admin"
            className={cn(
              "mt-2 flex items-center gap-2.5 rounded-nav px-2.5 py-2 text-[12.5px] transition-colors",
              pathname.startsWith("/admin")
                ? "bg-spark-blue font-medium text-white"
                : "font-normal text-spark-ink-faint hover:bg-spark-amber-tint"
            )}
          >
            <ShieldCheck size={15} strokeWidth={1.7} className="flex-none" />
            Admin
          </Link>
        )}
      </nav>

      <div className="mx-4 mt-3 h-px bg-spark-rule-soft" />

      <div className="px-2 pt-3">
        <div className="mb-1 flex items-center gap-2.5 px-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-spark-amber-tint text-[11px] font-semibold text-spark-amber">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-spark-ink">{user?.email}</p>
            <p className="text-[10.5px] text-spark-ink-faint">
              {!account
                ? " "
                : account.isAdmin
                  ? (account.isStaff ? "Staff" : "Admin-Unlimited")
                  : (PLAN_LABELS[account.tier] ?? account.tier + " plan")}
            </p>
          </div>
        </div>
        {/* Still the same form POST — that route clears the auth cookies by
            hand so the middleware sees none on the way to /login, and a client
            sign-out does not. The guard only decides whether it is submitted
            now or after the user has dealt with a recording still waiting on
            this device. */}
        <form ref={logoutFormRef} action="/api/auth/logout" method="POST">
          <SignOutGuard onProceed={() => logoutFormRef.current?.submit()} trigger={(requestSignOut) => (
            <button
              type="button"
              onClick={requestSignOut}
              className="flex w-full items-center gap-2.5 rounded-nav px-2.5 py-2 text-[12.5px] text-spark-ink-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={15} strokeWidth={1.7} className="flex-none" />
              Sign Out
            </button>
          )} />
        </form>
      </div>
    </aside>
  );
}
