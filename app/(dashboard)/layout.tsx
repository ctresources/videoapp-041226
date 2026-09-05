"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { GlobalVoiceShortcut } from "@/components/layout/global-voice-shortcut";
import { CreateProgressProvider } from "@/components/layout/create-progress";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Create draws its own sticky header treatment and a fixed footer, both
  // edge-to-edge, so it opts out of the shared page padding. Exact match only:
  // startsWith() also caught /create/[projectId], and the editor is a long
  // scrolling page with no scroll container of its own — overflow-hidden there
  // cut off everything below the fold.
  //
  // It does not opt out of normal document flow. The two-column cockpit that
  // once needed overflow-hidden here is gone, and position:sticky measured
  // against an overflow-hidden ancestor never sticks — the topbar rail would
  // scroll away with the page.
  const fullBleed = pathname === "/create";
  // /create and /create/[projectId] already own their own Space shortcut (or,
  // for the editor's script textarea, deliberately opt out of one).
  const onCreateRoute = pathname.startsWith("/create");

  /**
   * Hold-Space-to-talk lives on the dashboard, not on every screen.
   *
   * It listens on the window and swallows Space to do it, so on a page of
   * text — My Videos, Help, Billing — pressing Space to scroll instead
   * scrolled nothing, opened the microphone, and on release pushed the
   * reader into Create with whatever they had muttered. The shortcut is
   * worth having where starting a video is the point of the page; it is a
   * trap everywhere else.
   */
  const voiceShortcutRoute = pathname === "/dashboard";

  return (
    // No background here: the paper gradient lives on <body> and would be
    // covered by an opaque colour at this level.
    <CreateProgressProvider>
    <div className="flex min-h-screen">
      <GlobalVoiceShortcut disabled={onCreateRoute || !voiceShortcutRoute} />
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-300 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar mobile />
      </div>

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main
          className={cn(
            "flex-1 min-h-0",
            // Create keeps the scroll container every other route has; it only
            // opts out of the shared padding, because its header treatment and
            // footer are edge to edge and it sets its own gutters.
            fullBleed ? "overflow-auto" : "overflow-auto p-4 md:p-6"
          )}
        >
          {children}
        </main>
      </div>
    </div>
    </CreateProgressProvider>
  );
}
