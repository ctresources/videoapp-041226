-- An affiliate row is linked to an account by a token, not by its email.
--
-- resolveAffiliateForUser matched an approved, unlinked affiliate on email
-- alone and then bound it permanently to whichever account asked first.
-- Registration auto-confirms (email_confirm: true), so signing up with an
-- address proves nothing about controlling it — anyone who knew an approved
-- affiliate's email could register with it, inherit the ref code and the whole
-- commission balance, and connect their own bank before the real affiliate
-- ever made an account.
--
-- The token is emailed to the address on approval, so redeeming it is the
-- proof of control that signing up never was.

ALTER TABLE affiliates
  ADD COLUMN IF NOT EXISTS claim_token TEXT,
  ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- One row per token, and a fast lookup on redemption. Partial, because most
-- rows have no token: unapproved ones never got issued, claimed ones are
-- cleared.
CREATE UNIQUE INDEX IF NOT EXISTS affiliates_claim_token_idx
  ON affiliates (claim_token)
  WHERE claim_token IS NOT NULL;

-- Affiliates approved before this migration are already linked, or are
-- waiting with no token. Issue tokens to the unlinked ones so nobody has to be
-- re-approved by hand to receive a claim link.
UPDATE affiliates
SET claim_token = encode(gen_random_bytes(24), 'hex'),
    claim_token_expires_at = NOW() + INTERVAL '90 days'
WHERE status = 'approved'
  AND user_id IS NULL
  AND claim_token IS NULL;
