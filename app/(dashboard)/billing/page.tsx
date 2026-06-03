import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CheckCircle, CreditCard, Zap, Building2, User,
  AlertCircle, ArrowRight, ExternalLink, Sprout, Gift, Video,
} from "lucide-react";

const PLANS = [
  {
    key: "starter",
    name: "Starter",
    price: 59,
    videos: 4,
    highlighted: false,
    features: [
      "4 AI videos/month",
      "Unlimited camera recordings (up to 30 mins each)",
      "Built-in teleprompter",
      "Up to 2 min per AI video/reel",
      "Voice recording + AI script",
      "YouTube (16:9) & Reel (9:16) formats",
      "1 social platform (YouTube)",
      "Other platforms coming soon",
    ],
  },
  {
    key: "agent",
    name: "Agent",
    price: 89,
    videos: 8,
    highlighted: true,
    features: [
      "8 AI videos/month",
      "Unlimited camera recordings (up to 30 mins each)",
      "Built-in teleprompter",
      "Up to 2 min per AI video/reel",
      "Voice recording + AI script",
      "YouTube (16:9) & Reel (9:16) formats",
      "MLS listing auto-video",
      "1 social platform (YouTube)",
      "Other platforms coming soon",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 119,
    videos: 12,
    highlighted: false,
    features: [
      "12 AI videos/month",
      "Unlimited camera recordings (up to 30 mins each)",
      "Built-in teleprompter",
      "Up to 2 min per AI video/reel",
      "Voice recording + AI script",
      "YouTube (16:9) & Reel (9:16) formats",
      "MLS listing auto-video",
      "Priority rendering",
      "1 social platform (YouTube)",
      "Other platforms coming soon",
    ],
  },
];

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: User,
  beta: Gift,
  starter: Sprout,
  agent: User,
  pro: Zap,
  agency: Building2,
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { success?: string; canceled?: string; error?: string };
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: profileData } = await admin
    .from("profiles")
    .select("subscription_tier, subscription_status, credits_remaining, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id")
    .eq("id", user.id)
    .single();

  const profile = profileData as {
    subscription_tier: string;
    subscription_status: string | null;
    credits_remaining: number;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
  } | null;

  const currentTier = profile?.subscription_tier || "free";
  const isActive = profile?.subscription_status === "active";
  const isTrialing = profile?.subscription_status === "trialing";
  const isPastDue = profile?.subscription_status === "past_due";
  const hasSubscription = !!profile?.stripe_subscription_id;
  const periodEnd = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const currentPlan = PLANS.find((p) => p.key === currentTier);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-brand-text">Billing & Plan</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your subscription and usage</p>
      </div>

      {/* Success / canceled banners */}
      {searchParams.success && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl text-green-800">
          <CheckCircle size={18} className="shrink-0 text-green-600" />
          <div>
            <p className="font-semibold text-sm">You&apos;re all set! 🎉</p>
            <p className="text-xs text-green-700 mt-0.5">
              {isTrialing
                ? `Your 7-day free trial of the ${searchParams.success} plan has started. No charge until your trial ends.`
                : `Your ${searchParams.success} plan is now active. Start creating videos.`}
            </p>
          </div>
        </div>
      )}
      {searchParams.canceled && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800">
          <AlertCircle size={18} className="shrink-0 text-amber-500" />
          <p className="text-sm">Checkout was canceled. Your plan was not changed.</p>
        </div>
      )}
      {isPastDue && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800">
          <AlertCircle size={18} className="shrink-0 text-red-500" />
          <div>
            <p className="font-semibold text-sm">Payment failed</p>
            <p className="text-xs text-red-700 mt-0.5">Please update your payment method to keep your account active.</p>
          </div>
          <a href="/api/stripe/portal" className="ml-auto shrink-0">
            <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
              Update Card <ExternalLink size={12} />
            </Button>
          </a>
        </div>
      )}

      {/* Current plan summary */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
              currentTier === "pro" ? "bg-primary-50" : currentTier === "agency" ? "bg-purple-50" : "bg-slate-100"
            }`}>
              {(() => { const Icon = PLAN_ICONS[currentTier] || User; return <Icon size={22} className={currentTier === "pro" ? "text-primary-500" : currentTier === "agency" ? "text-purple-500" : "text-slate-400"} />; })()}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-bold text-brand-text text-lg capitalize">
                  {currentTier === "beta" ? "Beta" : currentPlan?.name || "Free"} Plan
                </p>
                {currentTier === "beta" ? (
                  <Badge variant="success">Beta Access</Badge>
                ) : (
                  <Badge variant={isActive ? "success" : isTrialing ? "success" : isPastDue ? "error" : "default"}>
                    {isActive ? "Active" : isTrialing ? "Trial" : isPastDue ? "Past Due" : hasSubscription ? "Canceled" : "No Plan"}
                  </Badge>
                )}
              </div>
              {currentTier === "beta" ? (
                <p className="text-sm text-slate-500">Beta access · {profile?.credits_remaining ?? 0} AI video{(profile?.credits_remaining ?? 0) !== 1 ? "s" : ""} remaining · Unlimited camera recordings</p>
              ) : currentPlan ? (
                <p className="text-sm text-slate-500">${currentPlan.price}/month · {currentPlan.videos} AI videos/month · Unlimited camera recordings</p>
              ) : null}
              {periodEnd && currentTier !== "beta" && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {isTrialing ? `Free trial ends ${periodEnd}` : profile?.cancel_at_period_end ? `Cancels on ${periodEnd}` : `Renews on ${periodEnd}`}
                </p>
              )}
              {!hasSubscription && currentTier !== "beta" && (
                <p className="text-xs text-slate-400 mt-0.5">No active subscription</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {hasSubscription && (
              <a href="/api/stripe/portal">
                <Button variant="outline" size="sm" className="gap-1.5 whitespace-nowrap">
                  <CreditCard size={13} /> Manage Billing
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Usage summary */}
        {(currentPlan || currentTier === "beta") && (
          <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* AI videos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Zap size={11} className="text-primary-500" /> AI videos this month
                </p>
                <p className="text-xs font-bold text-brand-text">
                  {profile?.credits_remaining ?? 0} of {currentPlan?.videos ?? 1} left
                </p>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full">
                <div
                  className="h-2 bg-primary-500 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, ((profile?.credits_remaining ?? 0) / (currentPlan?.videos ?? 1)) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                {currentTier === "beta" ? "Included with beta access" : "Resets each billing period"}
              </p>
            </div>
            {/* Camera recordings */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                  <Video size={11} className="text-orange-500" /> Camera recordings
                </p>
                <p className="text-xs font-bold text-emerald-600">Unlimited</p>
              </div>
              <div className="w-full h-2 bg-emerald-100 rounded-full">
                <div className="h-2 bg-emerald-400 rounded-full w-full" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Up to 30 mins each · no monthly cap</p>
            </div>
          </div>
        )}
      </Card>

      {/* Beta notice — no plan needed */}
      {currentTier === "beta" && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800">
          <Gift size={18} className="shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-sm">You&apos;re on beta access — no payment needed.</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              When your beta credits run out, choose a plan below to keep creating AI videos. Camera recordings stay unlimited on any paid plan.
            </p>
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <h3 className="text-base font-bold text-brand-text mb-4">
        {hasSubscription ? "Change Plan" : currentTier === "beta" ? "Upgrade to a Paid Plan" : "Choose a Plan"}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentTier && (isActive || isTrialing);
          const Icon = PLAN_ICONS[plan.key];
          return (
            <div
              key={plan.key}
              className={`rounded-2xl p-5 border relative transition-all ${
                plan.highlighted && !isCurrent
                  ? "border-primary-400 ring-2 ring-primary-100 bg-white"
                  : isCurrent
                  ? "border-accent-400 ring-2 ring-accent-100 bg-white"
                  : "border-slate-200 bg-white"
              }`}
            >
              {plan.highlighted && !isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary-500 to-secondary-500 text-white text-[10px] font-black px-3 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent-500 text-white text-[10px] font-black px-3 py-1 rounded-full">
                  Current Plan
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${plan.highlighted ? "bg-primary-50" : "bg-slate-100"}`}>
                  <Icon size={15} className={plan.highlighted ? "text-primary-500" : "text-slate-500"} />
                </div>
                <p className="font-bold text-brand-text">{plan.name}</p>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-black text-brand-text">${plan.price}</span>
                <span className="text-slate-400 text-sm">/mo</span>
              </div>

              <ul className="space-y-2 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle size={12} className="text-accent-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <a href="/api/stripe/portal">
                  <Button variant="outline" size="sm" className="w-full gap-1.5">
                    <CreditCard size={12} /> Manage
                  </Button>
                </a>
              ) : (
                <a href={`/api/stripe/checkout?plan=${plan.key}`}>
                  <Button
                    variant={plan.highlighted ? "primary" : "outline"}
                    size="sm"
                    className="w-full gap-1.5"
                  >
                    {hasSubscription ? (currentPlan && plan.price > currentPlan.price ? "Upgrade" : "Downgrade") : "Get Started"}
                    <ArrowRight size={12} />
                  </Button>
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* FAQ */}
      <Card>
        <h3 className="text-sm font-bold text-brand-text mb-4">Common Questions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { q: "Can I cancel anytime?", a: "Yes. Cancel from the Manage Billing page and your plan stays active until the end of your billing period." },
            { q: "What happens to unused videos?", a: "Videos reset each billing cycle and don't roll over. Use them or lose them." },
            { q: "Can I upgrade mid-month?", a: "Yes. You're charged a prorated amount for the remainder of your current billing period." },
            { q: "Is my payment info secure?", a: "All payments are processed by Stripe. We never store your card details." },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-xs font-semibold text-brand-text mb-1">{q}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
