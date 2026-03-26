"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Users, Video, ShieldCheck, UserX, UserCheck, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  role: string;
  subscription_tier: string;
  credits_remaining: number;
  onboarding_done: boolean;
  created_at: string;
  video_count?: number;
}

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [stats, setStats] = useState({ totalUsers: 0, totalVideos: 0, proUsers: 0 });

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const { users: data, stats: s } = await res.json();
    setUsers(data || []);
    setStats(s || { totalUsers: 0, totalVideos: 0, proUsers: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function handleRoleChange(userId: string, newRole: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role: newRole }),
    });
    if (res.ok) {
      setUsers((u) => u.map((user) => user.id === userId ? { ...user, role: newRole } : user));
      toast.success(`Role updated to ${newRole}`);
    } else {
      toast.error("Failed to update role");
    }
  }

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === "all" || u.subscription_tier === filterTier;
    return matchSearch && matchTier;
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Admin Panel</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage users and monitor system activity</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary-500", bg: "bg-primary-50" },
          { label: "Videos Generated", value: stats.totalVideos, icon: Video, color: "text-secondary-500", bg: "bg-purple-50" },
          { label: "Pro/Agency Users", value: stats.proUsers, icon: ShieldCheck, color: "text-accent-500", bg: "bg-teal-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="flex items-center gap-4">
            <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
              <Icon size={20} className={color} />
            </div>
            <div>
              <p className="text-2xl font-bold text-brand-text">{loading ? "—" : value}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="agency">Agency</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </Card>

      {/* Users table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["User", "Plan", "Credits", "Videos", "Role", "Joined", "Actions"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-brand-text">{user.full_name || "—"}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={user.subscription_tier === "pro" ? "info" : user.subscription_tier === "agency" ? "purple" : "default"}>
                        {user.subscription_tier}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.credits_remaining}</td>
                    <td className="px-4 py-3 text-slate-600">{user.video_count ?? 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={user.role === "admin" ? "warning" : "default"}>{user.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {user.role !== "admin" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs gap-1 text-secondary-500 hover:bg-purple-50"
                            onClick={() => handleRoleChange(user.id, "admin")}
                          >
                            <ShieldCheck size={12} /> Make Admin
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs gap-1 text-slate-400"
                            onClick={() => handleRoleChange(user.id, "user")}
                          >
                            <UserX size={12} /> Remove Admin
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">
                      No users match your search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
