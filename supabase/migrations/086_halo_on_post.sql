-- 086: a Halo video seen on its Halo post (2026-10-26, the owner's ask).
--
-- Set by the morning Halo run when the post's page shows the video, or by the
-- card's "It's on my post" button. The card then says "✓ On your Halo post"
-- and stops asking the agent to text Halo.
alter table public.autopilot_drafts add column if not exists on_halo_at timestamptz;
