-- Linked accounts (2026-11-25, the owner's approved mockup:
-- docs/mockups/switch-accounts.html). Someone with several SparkReels
-- accounts links them once, by signing in to each; their AI apps can then
-- switch between them when asked, without disconnecting.

-- One row per linked pair, stored with the smaller id first so a pair is
-- never in twice. Linking is mutual.
create table if not exists public.account_links (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index if not exists account_links_b_idx on public.account_links (user_b);

-- A one-time code from "Link another account", good for 15 minutes. Only
-- its hash is stored.
create table if not exists public.account_link_codes (
  code_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- The account an AI connection is using right now, when it switched to a
-- linked one. Null means the account that connected it.
alter table public.agent_connections
  add column if not exists active_user_id uuid references auth.users(id) on delete set null;

alter table public.account_links enable row level security;
alter table public.account_link_codes enable row level security;

create policy "own account links" on public.account_links
  for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());

-- New tables need explicit grants since 2026-10-30.
grant select on public.account_links to authenticated;
grant select, insert, update, delete on public.account_links, public.account_link_codes to service_role;
