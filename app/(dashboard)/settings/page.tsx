"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/providers/supabase-provider";
import { Lock, Trash2, LogOut, Share2, Globe, MapPin, Webhook, Palette } from "lucide-react";
import { CrmIntegrations } from "@/components/settings/crm-integrations";
import { BrandProfile, type BrandProfileInitial } from "@/components/settings/brand-profile";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { SUPPORTED_LANGUAGES } from "@/lib/utils/languages";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ newPass: "", confirm: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [prefs, setPrefs] = useState({ language: "en", city: "", state: "" });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [brandData, setBrandData] = useState<BrandProfileInitial | null>(null);

  // Redirect to login if user signs out while on this page
  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [user, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name, company_name, phone, company_phone, company_address, preferred_language, location_city, location_state, avatar_url, logo_url, voice_clone_id, heygen_voice_id, heygen_photo_id, website, license_number")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const row = data as {
          full_name: string | null; company_name: string | null; phone: string | null;
          company_phone: string | null; company_address: string | null;
          preferred_language: string | null; location_city: string | null; location_state: string | null;
          avatar_url: string | null; logo_url: string | null; voice_clone_id: string | null;
          heygen_voice_id: string | null; heygen_photo_id: string | null;
          website: string | null; license_number: string | null;
        } | null;
        if (row) {
          setPrefs({
            language: row.preferred_language || "en",
            city: row.location_city || "",
            state: row.location_state || "",
          });
          setBrandData({
            full_name:       row.full_name,
            company_name:    row.company_name,
            phone:           row.phone,
            company_phone:   row.company_phone,
            company_address: row.company_address,
            avatar_url:      row.avatar_url,
            logo_url:        row.logo_url,
            voice_clone_id:  row.voice_clone_id,
            heygen_voice_id: row.heygen_voice_id,
            heygen_photo_id: row.heygen_photo_id,
            website:         row.website,
            license_number:  row.license_number,
          });
        }
        setLoaded(true);
      });
  }, [user]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwords.newPass !== passwords.confirm) { toast.error("Passwords don't match"); return; }
    if (passwords.newPass.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: passwords.newPass });
    if (error) toast.error(error.message);
    else { toast.success("Password updated!"); setPasswords({ newPass: "", confirm: "" }); }
    setSavingPassword(false);
  }

  async function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSavingPrefs(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        preferred_language: prefs.language,
        location_city: prefs.city.trim() || null,
        location_state: prefs.state.trim() || null,
      })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Preferences saved!");
    setSavingPrefs(false);
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

  if (!loaded || !user) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
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

      {/* Content Preferences */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-teal-50 rounded-xl flex items-center justify-center">
            <Globe size={18} className="text-teal-500" />
          </div>
          <div>
            <h3 className="font-semibold text-brand-text">Content Preferences</h3>
            <p className="text-xs text-slate-400 mt-0.5">Used for AI script generation and trending topics</p>
          </div>
        </div>
        <form onSubmit={handleSavePrefs} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Video Language</label>
            <select
              value={prefs.language}
              onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.flag} {lang.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">AI scripts will be written and narrated in this language</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
              <MapPin size={13} className="text-slate-400" /> Your Market Location
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" value={prefs.city}
                onChange={(e) => setPrefs((p) => ({ ...p, city: e.target.value }))}
                placeholder="City (e.g. Austin)"
                className="text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input type="text" value={prefs.state}
                onChange={(e) => setPrefs((p) => ({ ...p, state: e.target.value }))}
                placeholder="State (e.g. TX)" maxLength={2}
                className="text-sm px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 uppercase"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Powers hyper-local scripts and trending topic suggestions
            </p>
          </div>
          <Button type="submit" loading={savingPrefs} className="self-start">
            Save Preferences
          </Button>
        </form>
      </Card>

      {/* Brand & AI Profile — includes contact info, photos, voice, avatar */}
      {brandData && user && (
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-pink-50 rounded-xl flex items-center justify-center">
              <Palette size={18} className="text-pink-500" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text">Brand & AI Profile</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Contact info, photos, voice clone, and AI avatar
              </p>
            </div>
          </div>
          <BrandProfile
            userId={user.id}
            email={user.email ?? ""}
            initial={brandData}
          />
        </Card>
      )}

      {/* CRM Integrations */}
      <Card>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
            <Webhook size={18} className="text-violet-500" />
          </div>
          <div>
            <h3 className="font-semibold text-brand-text">CRM Integration</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Auto-notify GoHighLevel, HubSpot, Follow Up Boss, BoldTrail when videos publish
            </p>
          </div>
        </div>
        <CrmIntegrations />
      </Card>

      {/* Change Password */}
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

      {/* Account Actions */}
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
