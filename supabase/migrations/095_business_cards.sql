-- Video Business Card (2026-10-30, the owner's approved mockup): one card per
-- agent at sparkreels.ai/card/<slug>, its settings (title, booking link, home
-- value page, which links show, colour, which video), the video card made from
-- it, and anonymous open/tap counts. Read and written only by the server.
create table if not exists public.business_cards (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  slug text not null unique,
  settings jsonb not null default '{}'::jsonb,
  video_card_url text,
  video_card_made_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.business_cards enable row level security;
grant select, insert, update, delete on public.business_cards to service_role;

create table if not exists public.business_card_events (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_card_events_user_time on public.business_card_events (user_id, created_at desc);
alter table public.business_card_events enable row level security;
grant select, insert, delete on public.business_card_events to service_role;
grant usage, select on sequence public.business_card_events_id_seq to service_role;
