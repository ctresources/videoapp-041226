"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card>
        <div className="text-center py-2">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-brand-text mb-2">Check your email</h1>
          <p className="text-sm text-slate-500 mb-6">
            We sent a password reset link to <span className="font-medium text-slate-700">{email}</span>. Click the link in the email to set a new password.
          </p>
          <p className="text-xs text-slate-400 mb-6">Didn&apos;t get it? Check your spam folder or try again.</p>
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            Try a different email
          </Button>
        </div>
        <p className="text-center text-sm text-slate-500 mt-5">
          <Link href="/login" className="text-primary-500 font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h1 className="text-2xl font-bold text-brand-text mb-1">Forgot password?</h1>
      <p className="text-sm text-slate-500 mb-6">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-5">
        <Link href="/login" className="text-primary-500 font-medium hover:underline">
          Back to sign in
        </Link>
      </p>
    </Card>
  );
}
