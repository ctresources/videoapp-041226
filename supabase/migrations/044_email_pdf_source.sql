-- 044: remember which PDF an imported email's words came from
--
-- A PDF attached to a forwarded email has always been read. A PDF the email
-- LINKED to was not: everything behind the link was dropped, leaving a
-- two-line covering note where a market report should have been. The inbound
-- handler now follows those links, which means a row in this table can hold
-- the report rather than the note — and nothing on screen said so.
--
-- Null for an ordinary forward. A filename (attachment) or the last segment of
-- the link for one that carried a PDF, which is what the picker shows.

ALTER TABLE public.email_imports
  ADD COLUMN IF NOT EXISTS pdf_source TEXT;
