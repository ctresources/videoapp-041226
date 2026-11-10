-- Halo leads (2026-11-09, the owner's approved mockup): Halo's "Send to my
-- CRM → Custom webhook" posts each new lead to the agent's own SparkReels
-- link. A buyer or seller lead gets a welcome video email drafted; a business
-- form (spotlight or listing on a community site) waits for the agent to make
-- a spotlight video, record one, or send the email alone. Nothing is sent
-- until the agent presses Approve. Read and written only by the server.

alter table public.profiles
  add column if not exists halo_leads jsonb not null default '{}'::jsonb,
  add column if not exists halo_leads_token text,
  add column if not exists halo_leads_secret_enc text;

create unique index if not exists idx_profiles_halo_leads_token
  on public.profiles (halo_leads_token) where halo_leads_token is not null;

create table if not exists public.halo_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('buyer', 'business')),
  name text,
  email text,
  phone text,
  site text,
  site_url text,
  page text,
  forms text[] not null default '{}',
  summary text,
  business_name text,
  town text,
  website text,
  category text,
  message text,
  lead_link text,
  raw jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'writing', 'making', 'camera', 'ready', 'sending', 'sent', 'skipped', 'failed')),
  mode text check (mode in ('video', 'camera', 'email')),
  script text,
  email_draft jsonb,
  project_id uuid references public.projects(id) on delete set null,
  video_id uuid references public.generated_videos(id) on delete set null,
  camera_since timestamptz,
  halo_draft_id uuid,
  error text,
  sent_at timestamptz,
  sent_via text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_halo_leads_user_time on public.halo_leads (user_id, received_at desc);
create index if not exists idx_halo_leads_user_email on public.halo_leads (user_id, lower(email));

alter table public.halo_leads enable row level security;
grant select, insert, update, delete on public.halo_leads to service_role;
