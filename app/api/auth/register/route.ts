import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewUser } from "@/lib/email";

// Known disposable / temp-mail domains that are commonly used for spam signups.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "trashmail.com", "yopmail.com",
  "throwam.com", "sharklasers.com", "guerrillamailblock.com", "grr.la",
  "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.net", "guerrillamail.org", "spam4.me", "getairmail.com",
  "fakeinbox.com", "maildrop.cc", "dispostable.com", "mailnull.com",
  "spamgourmet.com", "trashmail.at", "trashmail.me", "trashmail.io",
  "tempmail.com", "temp-mail.org", "throwaway.email", "discard.email",
  "mailnesia.com", "spamhereplease.com", "discardmail.com",
]);

/**
 * Returns true when a name looks like a randomly-generated string rather
 * than a real person's name. Catches patterns like "rRGbqkCiXveBrqTRW".
 *
 * Heuristics (ALL must fire together to avoid false positives):
 *  - No whitespace (no first+last or multi-word name)
 *  - Longer than 10 characters
 *  - Ratio of uppercase letters is between 20% and 80% (random mixed-case)
 *  - Vowel ratio below 25% (random strings rarely hit natural vowel density)
 */
function looksLikeRandomString(name: string): boolean {
  const trimmed = name.trim();
  if (/\s/.test(trimmed)) return false;          // has a space → real-ish name
  if (trimmed.length <= 10) return false;         // short names can be legit single words
  const upper = (trimmed.match(/[A-Z]/g) || []).length;
  const letters = (trimmed.match(/[a-zA-Z]/g) || []).length;
  if (letters === 0) return false;
  const upperRatio = upper / letters;
  if (upperRatio < 0.2 || upperRatio > 0.8) return false; // all-lower or all-upper = probably real
  const vowels = (trimmed.match(/[aeiouAEIOU]/g) || []).length;
  return vowels / letters < 0.25;
}

/**
 * Returns true when a Gmail address is using the dots trick to obscure
 * a real address. Pattern: multiple segments of 1–3 chars joined by dots.
 * e.g. "o.veda.c.i.y.u.so9.2@gmail.com"
 */
function isGmailDotsTrick(email: string): boolean {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain || !["gmail.com", "googlemail.com"].includes(domain)) return false;
  const parts = local.split(".");
  if (parts.length < 4) return false; // ≤3 dots is normal
  const shortParts = parts.filter((p) => p.length <= 2).length;
  return shortParts / parts.length >= 0.5; // majority of segments are 1–2 chars
}

export async function POST(req: NextRequest) {
  const { email, password, fullName } = await req.json();

  if (!email || !password || !fullName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Spam / bot heuristic checks ──────────────────────────────────────────────

  if (looksLikeRandomString(fullName)) {
    return NextResponse.json(
      { error: "Please enter your real full name." },
      { status: 400 },
    );
  }

  const emailLower = email.toLowerCase();
  const emailDomain = emailLower.split("@")[1] ?? "";

  if (DISPOSABLE_DOMAINS.has(emailDomain)) {
    return NextResponse.json(
      { error: "Please use a permanent email address to sign up." },
      { status: 400 },
    );
  }

  if (isGmailDotsTrick(email)) {
    return NextResponse.json(
      { error: "Please use your primary Gmail address (without extra dots)." },
      { status: 400 },
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  notifyNewUser({ name: fullName, email, provider: "email" });

  return NextResponse.json({ user_id: data.user.id });
}
