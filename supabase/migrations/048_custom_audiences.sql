-- Audiences a user names themselves, kept on the account.
--
-- A custom audience ("First responders", "Nurses relocating") was only ever
-- remembered in the browser it was spoken in, so one said on a phone was
-- missing from the picker on a computer. It lives on the profile now, beside
-- saved_markets, and follows the account.
--
-- The owner writes this column from the browser, like saved_markets. Anything
-- that reads it must treat it as untrusted: strings only, trimmed, capped in
-- length and count (see cleanAudienceList in lib/utils/audiences.ts).

alter table public.profiles
  add column if not exists custom_audiences jsonb not null default '[]'::jsonb;

comment on column public.profiles.custom_audiences is
  'Audience names the user added themselves, e.g. ["First responders"]. Written by the owner from the browser, so readers must treat it as untrusted: strings only, trimmed, capped in length and count.';
