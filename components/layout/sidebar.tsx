"use client";

import { cn } from "@/lib/utils/cn";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/providers/supabase-provider";
import { useEffect, useState, type ReactNode } from "react";

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
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/create", label: "Create Video" },
  { href: "/videos", label: "My Videos" },
  { href: "/tools", label: "AI Tools" },
  { href: "/calendar", label: "Calendar" },
  { href: "/analytics", label: "Analytics" },
  { href: "/social", label: "Social Media" },
  { href: "/billing", label: "Billing" },
  { href: "/affiliate", label: "Affiliate Program" },
  { href: "/settings", label: "Settings" },
  { href: "/help", label: "How It Works" },
];

const PLAN_LABELS: Record<string, string> = {
  free: "Free plan",
  beta: "Beta access",
  starter: "Starter plan",
  agent: "Agent plan",
  pro: "Pro plan",
};

// The dashboard layout renders this twice — once inside the mobile drawer and
// once as the desktop rail. The drawer copy passes mobile so it isn't hidden by
// the desktop-only breakpoint.
export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth();
  // Role and plan for the sidebar: the Admin link was rendered for everyone
  // (the /admin route bounced them straight back), and the plan label was
  // hardcoded to "Free plan" even for Pro subscribers.
  const [account, setAccount] = useState<{ isAdmin: boolean; tier: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/profile/allowance")
      .then((r) => (r.ok ? r.json() : null))
      .then((a) => a && setAccount({ isAdmin: !!a.isAdmin, tier: a.tier ?? "free" }))
      .catch(() => {});
  }, [user]);

  return (
    <aside
      className={cn(
        "flex-col w-[184px] shrink-0 min-h-screen bg-white border-r border-spark-rule py-4",
        mobile ? "flex" : "hidden md:flex"
      )}
    >
      {/* Logo */}
      <div className="px-4 pb-4">
        <Link href="/dashboard">
          <Image
            src="/sparkreels-logo.png"
            alt="SparkReels.ai — Speak. Spark. Share."
            width={138}
            height={48}
            className="block h-12 w-[138px] object-contain"
            style={{ filter: "brightness(0.72) saturate(1.35) contrast(1.18)" }}
            unoptimized
            priority
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-px px-2">
        {navItems.map(({ href, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
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
            </Link>
          );
        })}

        {/* Admin link — actually only for admins now. Hidden until the role is
            known, so it never flashes in for a regular user on load. */}
        {account?.isAdmin && (
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

      {/* Voice shortcut + account */}
      <div className="mt-auto flex flex-col gap-1.5 px-4 py-3.5">
        <div className="spark-eyebrow text-[9px]">VOICE SHORTCUT</div>
        <div className="text-[11px] leading-[1.45] text-spark-ink-muted">
          Hold{" "}
          <span className="spark-surface rounded px-[5px] py-px text-spark-ink">Space</span>{" "}
          anywhere to talk
        </div>
      </div>

      <div className="mx-4 h-px bg-spark-rule-soft" />

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
                  ? "Admin-Unlimited"
                  : (PLAN_LABELS[account.tier] ?? account.tier + " plan")}
            </p>
          </div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-nav px-2.5 py-2 text-[12.5px] text-spark-ink-muted transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={15} strokeWidth={1.7} className="flex-none" />
            Sign Out
          </button>
        </form>
      </div>
    </aside>
  );
}
