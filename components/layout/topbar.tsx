"use client";

import { Button } from "@/components/ui/button";
import { Menu, Plus, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/create": "Create Video",
  "/videos": "My Videos",
  "/social": "Social Media",
  "/settings": "Settings",
  "/admin": "Admin Panel",
};

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const pathname = usePathname();
  const title = Object.entries(pageTitles).find(([key]) =>
    pathname === key || (key !== "/dashboard" && pathname.startsWith(key))
  )?.[1] ?? "VoiceToVideos.AI";

  return (
    <header className="h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="md:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors"
        >
          <Menu size={20} className="text-slate-500" />
        </button>
        <h1 className="text-base font-semibold text-brand-text">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-2 rounded-xl hover:bg-slate-100 transition-colors relative">
          <Bell size={18} className="text-slate-500" />
        </button>
        <Link href="/create">
          <Button size="sm" className="gap-1.5">
            <Plus size={16} />
            <span className="hidden sm:inline">New Video</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
