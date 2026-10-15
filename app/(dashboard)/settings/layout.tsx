"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/**
 * Settings, with Social Accounts and Billing as tabs of it (2026-10-14, at the
 * owner's ask). They were their own menu items; now there is one place for
 * everything about the account. The old addresses (/billing, /social) still
 * work and open the right tab, because Stripe and many buttons point at them.
 */
const TABS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/social", label: "Social Accounts" },
  { href: "/settings/billing", label: "Billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <nav aria-label="Settings" className="mx-auto mb-6 flex max-w-4xl gap-1 overflow-x-auto border-b border-spark-rule">
        {TABS.map((t) => {
          const on = t.href === "/settings" ? pathname === "/settings" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] font-semibold transition-colors",
                on ? "border-spark-amber text-spark-ink" : "border-transparent text-spark-ink-muted hover:text-spark-ink",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
