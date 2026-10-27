-- 085: Seller Updates on AutoSparks (2026-10-26, the owner's mockup).
--
-- profiles.seller_auto        { enabled, weekday, time, video: "circle"|"none", text }
-- seller_auto_drafts          one card per listing per send day. The numbers,
--                             email and video live on seller_listing_updates
--                             (update_on = the send day), as in Spark Tools;
--                             this row is the card's state and the send.
--
-- status: open (numbers to add) → making (video being made) → ready (watch,
-- approve) → approved (sends at slot_at) → sent; or skipped / failed.

alter table public.profiles add column if not exists seller_auto jsonb;

create table if not exists public.seller_auto_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.seller_listings(id) on delete cascade,
  update_on date not null,
  slot_at timestamptz not null,
  status text not null default 'open'
    check (status in ('open', 'making', 'ready', 'approved', 'sent', 'skipped', 'failed')),
  mode text not null default 'video' check (mode in ('video', 'camera', 'email')),
  also_text boolean not null default true,
  project_id uuid,
  video_id uuid,
  error text,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, update_on)
);
create index if not exists seller_auto_drafts_user_idx on public.seller_auto_drafts (user_id, slot_at desc);
create index if not exists seller_auto_drafts_due_idx on public.seller_auto_drafts (slot_at) where status = 'approved';

-- Read and written only by the server, which checks the owner on every call.
alter table public.seller_auto_drafts enable row level security;
grant all on public.seller_auto_drafts to service_role;
