-- Affiliate program: applications, referral attribution, commission ledger,
-- and Stripe Connect payouts. All writes go through the service role (API
-- routes / webhook / cron); RLS only grants affiliates read access to their
-- own rows, plus an admin bypass. Follows the conventions in 008_stripe_billing.

-- ── affiliates: application + account ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliates (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- linked on first login post-approval
  full_name                   TEXT NOT NULL,
  email                       TEXT NOT NULL,
  website_or_social           TEXT,
  promotion_plan              TEXT,
  ref_code                    TEXT UNIQUE,                       -- issued on approval
  status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason            TEXT,
  stripe_connect_account_id   TEXT,
  connect_onboarding_status   TEXT NOT NULL DEFAULT 'not_started' CHECK (connect_onboarding_status IN ('not_started','pending','complete','restricted')),
  commission_rate             NUMERIC(5,4) NOT NULL DEFAULT 0.20,
  commission_duration_months  INTEGER NOT NULL DEFAULT 12,
  reviewed_by                 UUID REFERENCES public.profiles(id),
  reviewed_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_email_lower ON public.affiliates (lower(email));
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON public.affiliates (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_ref_code ON public.affiliates (ref_code);

-- ── affiliate_clicks: visit tracking ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  landing_path  TEXT,
  referrer      TEXT,
  ip_hash       TEXT,   -- hashed, never a raw IP
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_affiliate ON public.affiliate_clicks (affiliate_id, created_at);

-- ── affiliate_conversions: one row per referred paying customer ───────────────
CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id               UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  user_id                    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_customer_id         TEXT NOT NULL,
  stripe_subscription_id     TEXT,
  converted_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  commission_eligible_until  TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_affiliate ON public.affiliate_conversions (affiliate_id);

-- ── affiliate_payouts: one row per Stripe transfer (before commissions: FK'd) ─
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id        UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  amount_cents        INTEGER NOT NULL,
  stripe_transfer_id  TEXT UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate ON public.affiliate_payouts (affiliate_id);

-- ── affiliate_commissions: ledger, one row per Stripe invoice ─────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id             UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  conversion_id            UUID NOT NULL REFERENCES public.affiliate_conversions(id) ON DELETE CASCADE,
  stripe_invoice_id        TEXT NOT NULL UNIQUE,               -- webhook idempotency key
  invoice_amount_cents     INTEGER NOT NULL,
  commission_rate          NUMERIC(5,4) NOT NULL,              -- snapshot at creation
  commission_amount_cents  INTEGER NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','available','paid','void')),
  available_at             TIMESTAMPTZ NOT NULL,
  paid_at                  TIMESTAMPTZ,
  payout_id                UUID REFERENCES public.affiliate_payouts(id) ON DELETE SET NULL,
  void_reason              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_status ON public.affiliate_commissions (affiliate_id, status);

-- ── profiles: referral attribution (set via follow-up UPDATE after signup) ────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id UUID REFERENCES public.affiliates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code_used       TEXT,
  ADD COLUMN IF NOT EXISTS referral_attributed_at   TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles (referred_by_affiliate_id);

-- ── RLS: affiliates read only their own rows; admins bypass; all writes are
--        service-role (no INSERT/UPDATE policies for authenticated/anon) ──────
ALTER TABLE public.affiliates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_clicks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY affiliates_select_own ON public.affiliates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY affiliates_admin_all ON public.affiliates
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY affiliate_clicks_select_own ON public.affiliate_clicks
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));
CREATE POLICY affiliate_clicks_admin_all ON public.affiliate_clicks
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY affiliate_conversions_select_own ON public.affiliate_conversions
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));
CREATE POLICY affiliate_conversions_admin_all ON public.affiliate_conversions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY affiliate_payouts_select_own ON public.affiliate_payouts
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));
CREATE POLICY affiliate_payouts_admin_all ON public.affiliate_payouts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY affiliate_commissions_select_own ON public.affiliate_commissions
  FOR SELECT USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));
CREATE POLICY affiliate_commissions_admin_all ON public.affiliate_commissions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
