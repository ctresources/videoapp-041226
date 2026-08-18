"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // The Create cockpit is a full-height two-column layout that manages its own
  // scrolling, so it opts out of the shared page padding.
  const fullBleed = pathname.startsWith("/create");

  return (
    // No background here: the paper gradient lives on <body> and would be
    // covered by an opaque colour at this level.
    <div className="flex min-h-screen">
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
            fullBleed ? "overflow-hidden" : "overflow-auto p-4 md:p-6"
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
