-- 087: the agent's Google review link (2026-10-27), for the Ask for Google
-- Review Video Email tool. Saved in Settings; the email's big button opens it.
alter table public.profiles add column if not exists google_review_url text;
