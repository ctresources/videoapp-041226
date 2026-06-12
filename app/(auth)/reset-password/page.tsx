"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const newErrors: { password?: string; confirm?: string } = {};

    if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
    if (password !== confirm) newErrors.confirm = "Passwords do not match";
    if (Object.keys(newErrors).length) return setErrors(newErrors);

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated! Signing you in…");
    router.push("/create");
    router.refresh();
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold text-brand-text mb-1">Set new password</h1>
      <p className="text-sm text-slate-500 mb-6">Choose a strong password for your account.</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="New Password"
          type="password"
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
          error={errors.password}
          hint="At least 8 characters"
          autoComplete="new-password"
        />
        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
          error={errors.confirm}
          autoComplete="new-password"
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Update password
        </Button>
      </form>
    </Card>
  );
}
