-- 053: Seller Update (2026-10-15)
--
-- An agent's listings, and each week's activity on one, for the Seller Update
-- email in Spark Tools and My Sparks. Saved so next week's update starts from
-- last week's numbers and can say what went up.
--
-- seller_listings          one row per listing the agent is reporting on
-- seller_listing_updates   one row per listing per week (week_of is that
--                          week's Monday); writing the same week again
--                          replaces its numbers and email
--
-- Read and written only by the server, which checks the owner on every call,
-- like buyer_questions_cache: RLS on, no policies.

create table if not exists public.seller_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  seller_names text,
  list_price text,
  listed_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_listings_user_idx on public.seller_listings (user_id, created_at desc);
alter table public.seller_listings enable row level security;

create table if not exists public.seller_listing_updates (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.seller_listings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_of date not null,
  views integer,
  saves integer,
  showings integer,
  open_house_visitors integer,
  offers integer,
  feedback text,
  next_steps text,
  email jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, week_of)
);
create index if not exists seller_listing_updates_listing_idx on public.seller_listing_updates (listing_id, week_of desc);
alter table public.seller_listing_updates enable row level security;
