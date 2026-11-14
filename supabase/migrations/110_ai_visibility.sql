-- AI Visibility (2026-11-14, the owner's approved mockup,
-- docs/mockups/ai-visibility-mockup.html). Once a week SparkReels asks ChatGPT
-- search and Perplexity each town's top searches, written as questions, and
-- records whether the answer named the agent or cited one of their links.
-- Read and written only by the server (service role), like business_cards.

-- One row per town an agent watches: 1 / 2 / 3 on Creator / Producer /
-- Influencer (lib/ai-visibility/plans.ts). questions is
-- [{ q: "Is Blue Bell, PA a good place to live?", search: "is blue bell pa a good place to live" }].
create table if not exists public.ai_visibility_towns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  town text not null,
  state text not null,
  questions jsonb not null default '[]'::jsonb,
  -- Set when the agent swaps a question; the monthly refresh then leaves
  -- their list alone.
  questions_edited boolean not null default false,
  questions_refreshed_at timestamptz,
  last_checked_at timestamptz,
  -- "checking" while a check runs, so the page can say so; null otherwise.
  status text,
  created_at timestamptz not null default now()
);
create unique index if not exists uniq_ai_visibility_town
  on public.ai_visibility_towns (user_id, lower(town), upper(state));
create index if not exists idx_ai_visibility_towns_user on public.ai_visibility_towns (user_id);

-- One row per question, per AI search, per weekly check.
create table if not exists public.ai_visibility_checks (
  id uuid primary key default gen_random_uuid(),
  town_id uuid not null references public.ai_visibility_towns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- The Monday of the week the check belongs to (America/New_York).
  week_of date not null,
  question text not null,
  search text,
  engine text not null check (engine in ('chatgpt', 'perplexity')),
  named boolean not null default false,
  -- The agent's own links that were sources, and what kind each was.
  cited jsonb not null default '[]'::jsonb,
  -- Every source the answer used (domain + url), for "Who AI cited instead".
  sources jsonb not null default '[]'::jsonb,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_visibility_checks_town_week on public.ai_visibility_checks (town_id, week_of);
create index if not exists idx_ai_visibility_checks_user_week on public.ai_visibility_checks (user_id, week_of);

-- The agent's own website, the one link the app can't find for itself.
create table if not exists public.ai_visibility_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  website text,
  updated_at timestamptz not null default now()
);

alter table public.ai_visibility_towns enable row level security;
alter table public.ai_visibility_checks enable row level security;
alter table public.ai_visibility_settings enable row level security;

grant select, insert, update, delete on public.ai_visibility_towns to service_role;
grant select, insert, update, delete on public.ai_visibility_checks to service_role;
grant select, insert, update, delete on public.ai_visibility_settings to service_role;
