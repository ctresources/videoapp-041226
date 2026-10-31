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
// CRM got its own tab, and Account became 8 (2026-10-30, the owner's ask).
const TABS = [
  { href: "/settings", label: "Profile · 1–8" },
  { href: "/settings/social", label: "Social Accounts · 9" },
  { href: "/settings/crm", label: "CRM · 10" },
  { href: "/settings/billing", label: "Billing · 11" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      {/* overflow-y-hidden (2026-10-17): the tabs sit 1px low (-mb-px) to meet
          the underline, and with only overflow-x set the bar became 1px too
          tall and Windows drew a tiny up/down scrollbar at its right end. */}
      <nav aria-label="Settings" className="mx-auto mb-6 flex max-w-4xl gap-2 overflow-x-auto overflow-y-hidden border-b border-spark-rule">
        {TABS.map((t) => {
          const on = t.href === "/settings" ? pathname === "/settings" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px whitespace-nowrap border-b-[3px] px-4 py-3 text-[21px] font-bold transition-colors sm:text-[23px]",
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
