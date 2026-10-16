-- 055: tokens for other systems an agent connects by pasting a key (2026-10-15)
--
-- First BoldTrail: an API token the agent makes in BoldTrail (Lead Engine →
-- Lead Dropbox → My API Tokens) and pastes into Settings, so SparkReels can
-- email a seller through BoldTrail. Encrypted with the same key as the
-- YouTube tokens (lib/crypto/tokens.ts); never stored as plain text, never
-- sent back to the browser. last4 is only for "token ending 1a2b".
--
-- Read and written only by the server: RLS on, no policies.

create table if not exists public.integration_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  token_enc text not null,
  last4 text,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.integration_tokens enable row level security;
