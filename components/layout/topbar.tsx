"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/supabase-provider";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Create Video",
  "/videos": "My Videos",
  "/tools": "AI Tools",
  "/calendar": "Calendar",
  "/analytics": "Analytics",
  "/social": "Social Media",
  "/billing": "Billing",
  "/affiliate": "Affiliate Program",
  "/settings": "Settings",
  "/help": "How It Works",
  "/admin": "Admin Panel",
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const title =
    Object.entries(pageTitles).find(
      ([key]) => pathname === key || (key !== "/dashboard" && pathname.startsWith(key))
    )?.[1] ?? "SparkReels";

  return (
    <header className="flex h-[46px] shrink-0 items-center justify-between border-b border-spark-rule bg-white px-4 md:px-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded-nav p-1.5 transition-colors hover:bg-spark-amber-tint md:hidden"
        >
          <Menu size={18} strokeWidth={1.7} className="text-spark-ink-muted" />
        </button>
        {/* Logo on mobile (sidebar hidden); page title on desktop */}
        <Link href="/dashboard" className="md:hidden">
          <Image
            src="/sparkreels-logo.png"
            alt="SparkReels"
            width={118}
            height={40}
            className="block h-9 w-[118px] object-contain"
            style={{ filter: "brightness(0.72) saturate(1.35) contrast(1.18)" }}
            unoptimized
            priority
          />
        </Link>
        <h1 className="hidden text-[12.5px] font-medium text-spark-ink md:block">{title}</h1>
      </div>

      <div className="flex items-center gap-3.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e3d5bb] text-[10px] font-semibold text-spark-ink"
          title={user?.email ?? undefined}
        >
          {user?.email?.[0]?.toUpperCase() ?? "U"}
        </div>
      </div>
    </header>
  );
}
