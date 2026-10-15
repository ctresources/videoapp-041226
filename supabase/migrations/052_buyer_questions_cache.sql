-- What buyers in a market are asking AI, looked up once a day per market
-- and shared by everyone in it, for Spark Studio's buyer question card
-- (2026-10-15). Read and written only by the server.
create table if not exists public.buyer_questions_cache (
  market text not null,
  day date not null,
  questions jsonb not null,
  created_at timestamptz not null default now(),
  primary key (market, day)
);
alter table public.buyer_questions_cache enable row level security;
