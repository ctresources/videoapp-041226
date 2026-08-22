-- The free-tier trial window (camera recording, AI Tools) is anchored to
-- when a user's first video actually renders, not to signup date -- someone
-- who takes a week (or two months) to get around to it isn't penalized for
-- the delay. Null means "trial hasn't started yet"; set once, on the first
-- successful free-tier video generation, and never touched again.
alter table profiles add column if not exists first_video_generated_at timestamptz null;
