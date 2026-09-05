-- Stripe events are delivered at least once, so the webhook must be able to
-- recognise one it has already applied.
--
-- Every handler in the webhook is a read-then-write: checkout.session.completed
-- for a video pack reads purchased_short_videos and writes current + N. A
-- redelivery — which Stripe sends on any non-2xx, and on a timeout, and
-- sometimes simply because it delivers twice — ran that a second time and
-- granted the videos again. Nothing in the route noticed, because nothing
-- recorded what it had already seen.
--
-- The id is Stripe's own event id, so the primary key does the work: the
-- second insert of the same event fails, and the handler returns without
-- touching a balance.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only. No user ever reads this, and RLS with no policy denies
-- everyone else by default.
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Housekeeping: Stripe stops retrying long before 30 days, so rows older than
-- that protect nothing and only grow the table.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_at_idx
  ON stripe_webhook_events (received_at);
