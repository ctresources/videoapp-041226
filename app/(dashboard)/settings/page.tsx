"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";
import { User, Lock, Trash2, LogOut, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState({ fullName: "", company: "", phone: "" });
  const [passwords, setPasswords] = useState({ current: "", newPass: "", confirm: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name, company_name, phone")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const row = data as { full_name: string | null; company_name: string | null; phone: string | null } | null;
        if (row) {
          setProfile({
            fullName: row.full_name || "",
            company: row.company_name || "",
            phone: row.phone || "",
          });
        }
        setLoaded(true);
      });
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingProfile(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: profile.fullName.trim(),
        company_name: profile.company.trim() || null,
        phone: profile.phone.trim() || null,
      })
      .eq("id", user.id);

    if (error) toast.error(error.message);
    else toast.success("Profile updated!");
    setSavingProfile(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwords.newPass !== passwords.confirm) {
      toast.error("New passwords don't match");
      return;
    }
    if (passwords.newPass.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: passwords.newPass });
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated!");
      setPasswords({ current: "", newPass: "", confirm: "" });
    }
    setSavingPassword(false);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Are you sure? This will permanently delete your account and all your videos. This cannot be undone."
    );
    if (!confirmed) return;
    toast.error("To delete your account, please contact support@voicetovideos.ai");
  }

  if (!loaded) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-2xl h-48 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Social Accounts quick link */}
      <Link href="/settings/social">
        <Card className="flex items-center justify-between cursor-pointer hover:border-primary-300 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-secondary-50 rounded-xl flex items-center justify-center">
              <Share2 size={18} className="text-secondary-500" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text">Social Accounts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Connect YouTube, Instagram, TikTok</p>
            </div>
          </div>
          <span className="text-sm text-primary-500 group-hover:underline">Manage →</span>
        </Card>
      </Link>

      {/* Profile */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-primary-50 rounded-xl flex items-center justify-center">
            <User className="w-4.5 h-4.5 text-primary-500" size={18} />
          </div>
          <h3 className="font-semibold text-brand-text">Profile</h3>
        </div>
        <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-xl shrink-0">
              {profile.fullName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div>
              <p className="text-sm font-medium text-brand-text">{profile.fullName || "Your Name"}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>
          </div>
          <Input
            label="Full Name"
            value={profile.fullName}
            onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
            placeholder="Jane Smith"
          />
          <Input
            label="Company / Brokerage"
            value={profile.company}
            onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))}
            placeholder="Smith Realty Group"
          />
          <Input
            label="Phone"
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+1 (555) 000-0000"
          />
          <Button type="submit" loading={savingProfile} className="self-start">
            Save Profile
          </Button>
        </form>
      </Card>

      {/* Password */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <Lock size={18} className="text-slate-500" />
          </div>
          <h3 className="font-semibold text-brand-text">Change Password</h3>
        </div>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <Input
            label="New Password"
            type="password"
            value={passwords.newPass}
            onChange={(e) => setPasswords((p) => ({ ...p, newPass: e.target.value }))}
            placeholder="Min. 8 characters"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={passwords.confirm}
            onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
            placeholder="Repeat new password"
          />
          <Button type="submit" loading={savingPassword} variant="outline" className="self-start">
            Update Password
          </Button>
        </form>
      </Card>

      {/* Danger zone */}
      <Card className="border border-red-100">
        <h3 className="font-semibold text-brand-text mb-4">Account Actions</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="ghost" onClick={handleLogout} className="gap-2 text-slate-500">
            <LogOut size={16} /> Sign Out
          </Button>
          <Button variant="danger" onClick={handleDeleteAccount} className="gap-2">
            <Trash2 size={16} /> Delete Account
          </Button>
        </div>
      </Card>
    </div>
  );
}
