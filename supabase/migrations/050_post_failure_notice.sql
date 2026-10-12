-- 050: telling an agent when a post did not go out
--
-- A post to another platform can be refused minutes after it was sent, by
-- which time the Publish window is usually closed. The reason was saved on the
-- row and shown nowhere, so the agent could reasonably believe it had posted.
-- An expired connection is the bad case: every post after it fails the same
-- way until someone happens to look.
--
-- acknowledged_at     Set when the agent dismisses the note in My Sparks, so
--                     it stops being shown. The row and its reason are kept.
--
-- failure_emailed_at  Set when the email about this failure was sent. Also
--                     what stops a run of failures on one platform (five posts
--                     against one expired connection) from sending five emails.
--
-- Both additive and null for every existing row.

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_emailed_at TIMESTAMPTZ;
