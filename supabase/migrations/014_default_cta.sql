-- Default video CTA template + years-in-business for the CTA credibility line.
-- default_cta stores the user's editable template with {city}/{state}/{name}
-- placeholders; NULL means "use the built-in template". market_years is text
-- so values like "20+" work.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS default_cta TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS market_years TEXT;
