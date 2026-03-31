"use client";

import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Mic,
  Video,
  Share2,
  Settings,
  LogOut,
  ShieldCheck,
  CalendarDays,
  BarChart2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/providers/supabase-provider";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/create",    icon: Mic,             label: "Create Video" },
  { href: "/videos",    icon: Video,           label: "My Videos" },
  { href: "/calendar",  icon: CalendarDays,    label: "Calendar" },
  { href: "/analytics", icon: BarChart2,       label: "Analytics" },
  { href: "/social",    icon: Share2,          label: "Social Media" },
  { href: "/settings",  icon: Settings,        label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 min-h-screen shrink-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <Link href="/dashboard">
          <Image
            src="https://gfawbvsokbgrlbcfqrkh.supabase.co/storage/v1/object/public/logos/b1ed3314-78e1-4c73-bb4a-b6ad59460692/1774386361991-new_animated_logo_ver_2.gif"
            alt="VoiceToVideos.AI"
            width={150}
            height={44}
            unoptimized
            priority
          />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-primary-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-brand-text"
              )}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" size={18} />
              {label}
            </Link>
          );
        })}

        {/* Admin link — shown only if admin */}
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mt-2",
            pathname.startsWith("/admin")
              ? "bg-secondary-500 text-white shadow-sm"
              : "text-slate-400 hover:bg-slate-100 hover:text-brand-text"
          )}
        >
          <ShieldCheck size={18} className="shrink-0" />
          Admin
        </Link>
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold text-sm shrink-0">
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-text truncate">{user?.email}</p>
            <p className="text-xs text-slate-400">Free plan</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all w-full"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
