-- Document that the YouTube token columns now hold ciphertext.
--
-- No schema change is needed: the encrypted form is a string, and these are
-- already TEXT. Storing it in place rather than adding *_enc columns avoids a
-- dual-read period where two columns can disagree about which is authoritative
-- — the failure mode that leaves half a table readable and half not.
--
-- Values are told apart by prefix, so both forms coexist safely:
--   plaintext   ya29.a0AfB_...
--   encrypted   v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
--
-- decryptToken() in lib/crypto/tokens.ts returns anything without the "v1:"
-- prefix unchanged, so rows written before TOKEN_ENCRYPTION_KEY existed keep
-- working and are rewritten encrypted the first time they are read or
-- refreshed. Nothing here needs to backfill; the application migrates rows as
-- it touches them, and it cannot encrypt them anyway — the key lives in the
-- app environment, deliberately not in the database.
--
-- Note the columns on social_accounts named access_token_enc / refresh_token_enc
-- are NOT part of this. That table has never held a row and nothing writes to
-- it; its "_enc" naming described an intention that was never implemented.

COMMENT ON COLUMN public.profiles.youtube_access_token IS
  'OAuth access token. AES-256-GCM encrypted as v1:<iv>:<tag>:<data> when TOKEN_ENCRYPTION_KEY is set; legacy rows may still be plaintext. Read via decryptToken().';

COMMENT ON COLUMN public.profiles.youtube_refresh_token IS
  'OAuth refresh token — a long-lived credential granting upload access to the user''s channel until revoked. AES-256-GCM encrypted as v1:<iv>:<tag>:<data> when TOKEN_ENCRYPTION_KEY is set; legacy rows may still be plaintext. Read via decryptToken().';
