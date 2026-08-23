"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/supabase-provider";
import { useCreateProgress } from "@/components/layout/create-progress";
import { cn } from "@/lib/utils/cn";

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

  // Set only on /create, by the page itself. On every other route this is null
  // and the bar stays the ordinary white one.
  const progress = useCreateProgress();
  const onCreate = progress !== null;

  return (
    // Sticky only in the Create treatment: elsewhere the bar has always
    // scrolled with the page and moving it would be a change to every route.
    <div className={cn("shrink-0", onCreate && "sticky top-0 z-20")}>
      <header
        className={cn(
          "flex h-[46px] items-center justify-between border-b px-4 md:px-5",
          onCreate ? "border-[#050505] bg-[#050505]" : "border-spark-rule bg-white"
        )}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className={cn(
              "rounded-nav p-1.5 transition-colors md:hidden",
              onCreate ? "hover:bg-white/10" : "hover:bg-spark-amber-tint"
            )}
          >
            <Menu
              size={18}
              strokeWidth={1.7}
              className={onCreate ? "text-spark-paper" : "text-spark-ink-muted"}
            />
          </button>
          {/* Logo on mobile (sidebar hidden); page title on desktop */}
          <Link href="/dashboard" className="md:hidden">
            <Image
              src="/sparkreels-logo.png"
              alt="SparkReels"
              width={118}
              height={40}
              className="block h-9 w-[118px] object-contain"
              // The darkening filter is there to hold the logo against white.
              // On the black bar it would sink into the background.
              style={onCreate ? undefined : { filter: "brightness(0.72) saturate(1.35) contrast(1.18)" }}
              unoptimized
              priority
            />
          </Link>
          <h1
            className={cn(
              "hidden text-[12.5px] font-medium md:block",
              onCreate ? "text-spark-paper" : "text-spark-ink"
            )}
          >
            {title}
          </h1>
        </div>

        <div className="flex items-center gap-3.5">
          {onCreate && (
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-spark-amber">
              {progress.label}
            </span>
          )}
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
              onCreate ? "bg-spark-blue text-spark-paper" : "bg-[#e3d5bb] text-spark-ink"
            )}
            title={user?.email ?? undefined}
          >
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      </header>

      {/* Progress rail. The four-stop gradient is already the app's CTA
          gradient, so this needs no new colour. */}
      {onCreate && (
        <div className="h-[3px] w-full bg-spark-rule">
          <div
            className="spark-cta-gradient h-full transition-[width] duration-500 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
