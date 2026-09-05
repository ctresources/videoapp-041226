-- Suspension stops overloading the role column.
--
-- Two bugs lived in that overloading. Reactivating always wrote role 'user',
-- so a suspended admin came back as an ordinary user — the role they held was
-- not stored anywhere and could not be restored. And nothing in the app ever
-- read role = 'suspended': not the middleware, not any API route, not the
-- login path. Suspending someone changed a value no code consulted, so the
-- button never locked anyone out of anything.
--
-- With its own column, role survives a suspension and the middleware has
-- something unambiguous to check.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Anyone parked in the old scheme keeps their suspension and gets a real role
-- back. 'user' is the only safe assumption — the original is unrecoverable.
UPDATE profiles
SET suspended = TRUE,
    suspended_at = COALESCE(suspended_at, NOW()),
    role = 'user'
WHERE role = 'suspended';
