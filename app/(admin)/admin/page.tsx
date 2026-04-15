"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Users, Video, ShieldCheck, UserX, UserCheck,
  ChevronDown, Coins, ToggleLeft, ToggleRight, ChevronRight,
} from "lucide-react";
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

const TIERS = ["free", "starter", "agent", "pro", "agency"] as const;
const TIER_COLORS: Record<string, "default" | "info" | "success" | "warning" | "purple"> = {
  free: "default", starter: "warning", agent: "success", pro: "info", agency: "purple",
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTier, setFilterTier] = useState("all");
  const [stats, setStats] = useState({ totalUsers: 0, totalVideos: 0, proUsers: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creditInputs, setCreditInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) return;
    const { users: data, stats: s } = await res.json();
    setUsers(data || []);
    setStats(s || { totalUsers: 0, totalVideos: 0, proUsers: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function patch(userId: string, payload: Record<string, unknown>, successMsg: string) {
    setSaving((s) => ({ ...s, [userId]: true }));
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, ...payload }),
    });
    setSaving((s) => ({ ...s, [userId]: false }));
    if (res.ok) {
      toast.success(successMsg);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...payload } : u));
    } else {
      const { error } = await res.json();
      toast.error(error || "Update failed");
    }
  }

  function handleRoleChange(userId: string, newRole: string) {
    patch(userId, { role: newRole }, `Role updated to ${newRole}`);
  }

  function handleTierChange(userId: string, tier: string) {
    patch(userId, { subscription_tier: tier }, `Plan changed to ${tier}`);
  }

  function handleSuspend(userId: string, suspend: boolean) {
    patch(userId, { suspended: suspend }, suspend ? "User suspended" : "User reactivated");
  }

  function handleCreditsSet(userId: string) {
    const val = parseInt(creditInputs[userId] || "");
    if (isNaN(val) || val < 0) { toast.error("Enter a valid number"); return; }
    patch(userId, { credits_remaining: val }, `Credits set to ${val}`);
  }

  function handleCreditsAdjust(userId: string, delta: number) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const newVal = Math.max(0, user.credits_remaining + delta);
    patch(userId, { credits_remaining: newVal }, `Credits ${delta > 0 ? "added" : "removed"}: now ${newVal}`);
  }

  const filtered = users.filter((u) => {
    const matchSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name || "").toLowerCase().includes(search.toLowerCase());
    const matchTier = filterTier === "all" || u.subscription_tier === filterTier;
    return matchSearch && matchTier;
  });

  const isSuspended = (u: UserRow) => u.role === "suspended";

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
          { label: "Pro / Agency Users", value: stats.proUsers, icon: ShieldCheck, color: "text-accent-500", bg: "bg-teal-50" },
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
              {TIERS.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </Card>

      {/* Users table */}
      <Card padding="none">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["User", "Plan", "Credits", "Videos", "Status", "Joined", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((user) => (
                  <>
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${isSuspended(user) ? "opacity-50" : ""}`}
                      onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-brand-text">{user.full_name || "—"}</p>
                          <p className="text-xs text-slate-400">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={TIER_COLORS[user.subscription_tier] ?? "default"}>
                          {user.subscription_tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{user.credits_remaining}</td>
                      <td className="px-4 py-3 text-slate-600">{user.video_count ?? 0}</td>
                      <td className="px-4 py-3">
                        {isSuspended(user)
                          ? <Badge variant="error">Suspended</Badge>
                          : user.role === "admin"
                          ? <Badge variant="warning">Admin</Badge>
                          : <Badge variant="default">Active</Badge>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight
                          size={14}
                          className={`text-slate-300 transition-transform ${expandedId === user.id ? "rotate-90" : ""}`}
                        />
                      </td>
                    </tr>

                    {/* Expanded actions row */}
                    {expandedId === user.id && (
                      <tr key={`${user.id}-expand`} className="bg-slate-50/80">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="flex flex-wrap gap-6">

                            {/* Plan */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Change Plan</p>
                              <div className="flex gap-1.5">
                                {TIERS.map((t) => (
                                  <button
                                    key={t}
                                    disabled={saving[user.id]}
                                    onClick={() => handleTierChange(user.id, t)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                      user.subscription_tier === t
                                        ? "bg-primary-500 text-white border-primary-500"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-primary-300"
                                    }`}
                                  >
                                    {t[0].toUpperCase() + t.slice(1)}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Credits */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Credits ({user.credits_remaining} now)</p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleCreditsAdjust(user.id, -5)}
                                  disabled={saving[user.id]}
                                  className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:border-red-300 hover:text-red-500 transition-all"
                                >−5</button>
                                <button
                                  onClick={() => handleCreditsAdjust(user.id, 5)}
                                  disabled={saving[user.id]}
                                  className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:border-green-300 hover:text-green-600 transition-all"
                                >+5</button>
                                <button
                                  onClick={() => handleCreditsAdjust(user.id, 20)}
                                  disabled={saving[user.id]}
                                  className="px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:border-green-300 hover:text-green-600 transition-all"
                                >+20</button>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="Set to..."
                                    value={creditInputs[user.id] ?? ""}
                                    onChange={(e) => setCreditInputs((c) => ({ ...c, [user.id]: e.target.value }))}
                                    className="w-20 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
                                  />
                                  <button
                                    onClick={() => handleCreditsSet(user.id)}
                                    disabled={saving[user.id]}
                                    className="px-2.5 py-1.5 text-xs bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-all"
                                  >
                                    <Coins size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Role */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Role</p>
                              <div className="flex gap-1.5">
                                {user.role !== "admin" && !isSuspended(user) ? (
                                  <button
                                    onClick={() => handleRoleChange(user.id, "admin")}
                                    disabled={saving[user.id]}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:border-secondary-400 hover:text-secondary-600 transition-all"
                                  >
                                    <ShieldCheck size={12} /> Make Admin
                                  </button>
                                ) : user.role === "admin" ? (
                                  <button
                                    onClick={() => handleRoleChange(user.id, "user")}
                                    disabled={saving[user.id]}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:border-slate-400 text-slate-500 transition-all"
                                  >
                                    <UserX size={12} /> Remove Admin
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {/* Suspend */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-2">Account</p>
                              {isSuspended(user) ? (
                                <button
                                  onClick={() => handleSuspend(user.id, false)}
                                  disabled={saving[user.id]}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-all"
                                >
                                  <UserCheck size={12} /> Reactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSuspend(user.id, true)}
                                  disabled={saving[user.id] || user.role === "admin"}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-all"
                                >
                                  <ToggleLeft size={12} /> Suspend
                                </button>
                              )}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
