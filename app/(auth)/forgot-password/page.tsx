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
    if (!email) return toast.error("Please enter your email");

    setLoading(true);
    const supabase = createClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <Card>
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-brand-text mb-2">Check your email</h1>
          <p className="text-sm text-slate-500 mb-6">
            We sent a password reset link to <strong>{email}</strong>. Click the link in the email to set a new password.
          </p>
          <Link href="/login" className="text-sm text-primary-500 hover:underline">
            Back to sign in
          </Link>
        </div>
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
          autoFocus
        />
        <Button type="submit" loading={loading} size="lg" className="w-full">
          Send Reset Link
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-5">
        Remember your password?{" "}
        <Link href="/login" className="text-primary-500 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
