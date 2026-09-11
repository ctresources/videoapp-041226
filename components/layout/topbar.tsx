"use client";

import { ArrowLeft, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/providers/supabase-provider";
import { useCreateProgress } from "@/components/layout/create-progress";
import { cn } from "@/lib/utils/cn";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Create",
  "/videos": "My Content",
  "/tools": "AI Tools",
  "/campaigns": "Campaigns",
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
  const router = useRouter();
  const { user } = useAuth();

  /**
   * Back, on every screen except the one there is nothing behind.
   *
   * On desktop the sidebar makes every destination one click away, so this was
   * never missed there. On a phone the sidebar is folded behind the hamburger,
   * which left several screens — Billing, Analytics, the affiliate page, My
   * Videos — with no visible way out except the browser chrome, and the
   * install-to-home-screen version has no browser chrome.
   *
   * Not on the Create routes. Those are a numbered flow and their step footer
   * already carries a Back that names the step it returns to — "Brief",
   * "Script", "Setup". A second Back in the bar above it would look like the
   * same control and do something different: leave the video instead of
   * stepping back inside it. Where a step deliberately has no way back — mid
   * render, when there is nothing to return to — that is the answer, not a
   * gap for this to fill.
   */
  const showBack = pathname !== "/dashboard" && !pathname.startsWith("/create");

  function goBack() {
    // history.length counts entries for the whole tab, so a deep link opened
    // in a fresh tab reads as 1 and lands on the dashboard rather than on
    // whatever the browser had before this app.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/dashboard");
  }
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
          {showBack && (
            <button
              onClick={goBack}
              aria-label="Go back"
              className={cn(
                // Sized as a real tap target rather than to the arrow: at
                // 18px the icon alone is under half the 44px minimum, on the
                // one control a phone user reaches for most.
                "flex items-center gap-1.5 rounded-nav px-2.5 py-2 text-[12.5px] font-medium transition-colors",
                onCreate
                  ? "text-spark-paper hover:bg-white/10"
                  : "text-spark-ink-muted hover:bg-spark-amber-tint hover:text-spark-ink"
              )}
            >
              <ArrowLeft size={17} strokeWidth={1.9} />
              <span className="hidden sm:inline">Back</span>
            </button>
          )}
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
