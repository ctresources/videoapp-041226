"use client";

import { ArrowLeft, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCreateProgress } from "@/components/layout/create-progress";
import { cn } from "@/lib/utils/cn";
import { AskSparklee } from "@/components/layout/ask-sparklee";
import { AccountMenu, MeetMenu, TopNav } from "@/components/layout/top-nav";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Spark Studio",
  "/videos": "My Sparks",
  "/newsletter": "Newsletter",
  "/video-email": "Email A Video",
  "/tools": "Spark Tools",
  "/campaigns": "Spark Calendar",
  "/calendar": "Spark Calendar",
  "/analytics": "Spark Insights",
  "/social": "Social Media",
  "/billing": "Billing",
  "/home": "Home",
  "/affiliate": "Affiliate Program",
  "/settings": "Settings",
  "/whats-new": "What's New",
  "/help": "How It Works",
  "/admin": "Admin Panel",
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();

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
    else router.push("/create");
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
    <>
    {/* Sticky only in the Create treatment: elsewhere the bar has always
        scrolled with the page and moving it would be a change to every route. */}
    <div className={cn("shrink-0", onCreate && "sticky top-0 z-20")}>
      <header
        className={cn(
          "flex h-[46px] items-center justify-between border-b px-4 md:px-5",
          onCreate ? "border-[#050505] bg-[#050505]" : "border-spark-rule bg-white"
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
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
          {/* The logo at every width: on computers the side menu that carried
              it is gone, and the page names run across this bar instead. */}
          {/* The owner's new logo (2026-10-15). It is drawn on black, so the
              white bar gets its own copy: background taken out, "Spark" in
              ink and the gold a shade deeper. */}
          {/* Phones only since 2026-10-29: on computers the side menu shows
              the logo, and two side by side read as a mistake. */}
          <Link href="/home" className="shrink-0 md:hidden">
            <Image
              src={onCreate ? "/sparkreels-logo-dark-bar.webp" : "/sparkreels-logo-light-bar.webp"}
              alt="SparkReels.ai"
              width={140}
              height={30}
              // 168 -> 140 wide (2026-10-22): the page names ran into Meet
              // on a laptop at 100% zoom.
              className="block h-[30px] w-[140px] object-contain"
              unoptimized
              priority
            />
          </Link>
          {/* The page's name, for screen readers: the underlined name in the
              bar is what shows it to everyone else. */}
          <h1 className="sr-only">{title}</h1>
          <TopNav dark={onCreate} />
        </div>

        <div className="flex shrink-0 items-center gap-3.5">
          {/* Google Meet, on computers (2026-10-20): Start now or Schedule
              for later. There is no side menu here, so the phone menu's rows
              never showed. */}
          <MeetMenu dark={onCreate} />
          {/* The "Step 1" label came off at the owner's ask (2026-10-15): the
              steps bar on the page already says where you are. */}
          <AccountMenu dark={onCreate} />
        </div>
      </header>

      {/* The progress rail under the bar came off at the owner's pick
          (2026-10-15): it met the page underline a pixel off and read as a
          crooked line, and the steps bar on the page already shows where
          you are. */}
    </div>
    {/* Ask Sparklee, just under the bar's line in the top right corner, on
        every page and at every width (2026-10-24, the owner's ask; it was in
        the bar itself, computers only). Its own row, not floating, so it never
        covers anything on a page; outside the sticky part, so on Create it
        scrolls away with the page instead of riding over it. */}
    <div className="flex shrink-0 justify-end px-4 pt-2.5 md:px-5">
      <AskSparklee />
    </div>
    </>
  );
}
