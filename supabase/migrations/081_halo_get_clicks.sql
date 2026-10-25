-- Every press of "Get Halo" (2026-10-24, the owner's ask), so she can match
-- the agents who went to sign up against her Halo dashboard. Whose link they
-- got is kept (affiliate_id null = the owner's). signed_up_at is set by hand
-- in Admin → Halo once she sees them on Halo; Halo has no way to tell us.
create table if not exists public.halo_get_clicks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  affiliate_id uuid references public.affiliates(id) on delete set null,
  link text not null,
  signed_up_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists halo_get_clicks_user_idx on public.halo_get_clicks (user_id, created_at desc);

-- Server only: written and read with the service role.
alter table public.halo_get_clicks enable row level security;
grant select, insert, update, delete on public.halo_get_clicks to service_role;
grant select on public.halo_get_clicks to authenticated;
