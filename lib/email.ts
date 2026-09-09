const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = "support@sparkreels.ai";
const FROM_EMAIL = process.env.NOTIFY_FROM_EMAIL || "SparkReels <noreply@sparkreels.ai>";

export async function notifyNewUser({
  name,
  email,
  provider,
}: {
  name: string | null;
  email: string | null;
  provider: "email" | "google";
}) {
  if (!RESEND_API_KEY) return;

  const displayName = name || "(no name)";
  const displayEmail = email || "(no email)";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `New user signed up — ${displayName}`,
      html: `
        <p>A new user just signed up on SparkReels.</p>
        <table>
          <tr><td><strong>Name</strong></td><td>${displayName}</td></tr>
          <tr><td><strong>Email</strong></td><td>${displayEmail}</td></tr>
          <tr><td><strong>Method</strong></td><td>${provider === "google" ? "Google OAuth" : "Email / Password"}</td></tr>
        </table>
      `,
    }),
  }).catch(() => {});
}

/** Someone joined the waitlist because the beta was full. */
export async function notifyWaitlistSignup({
  name,
  email,
}: {
  name: string | null;
  email: string;
}) {
  if (!RESEND_API_KEY) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `Waitlist signup — ${name || email}`,
      html: `
        <p>Someone hit the full beta and joined the waitlist.</p>
        <table>
          <tr><td><strong>Name</strong></td><td>${name || "(not given)"}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
        </table>
        <p>They were also offered a paid plan, which is not capped.</p>
      `,
    }),
  }).catch(() => {});
}

/**
 * Beta capacity warning. Sent when the free spots are nearly or fully gone,
 * so the cap isn't discovered by a would-be customer before the owner.
 */
export async function notifyBetaCapacity({
  count,
  max,
  remaining,
}: {
  count: number;
  max: number;
  remaining: number;
}) {
  if (!RESEND_API_KEY) return;

  const full = remaining <= 0;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: full
        ? `Beta is FULL — all ${max} spots taken`
        : `Beta almost full — ${remaining} ${remaining === 1 ? "spot" : "spots"} left`,
      html: full
        ? `<p>All <strong>${max}</strong> beta spots are gone (${count} accounts).</p>
           <p>New signups now see the waitlist form instead of the free video.
           To reopen free spots, move <code>BETA_START_AT</code> forward or raise
           <code>MAX_BETA_USERS</code> in <code>lib/capacity.ts</code>.</p>`
        : `<p><strong>${remaining}</strong> of ${max} free beta spots remain (${count} taken).</p>
           <p>Once they're gone, new signups get the waitlist form and a paid-plan option.</p>`,
    }),
  }).catch(() => {});
}

/** Notifies the owner that a new affiliate application came in for review. */
export async function notifyNewAffiliateApplication({
  name,
  email,
  website,
}: {
  name: string;
  email: string;
  website?: string | null;
}) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `New affiliate application — ${name}`,
      html: `
        <p>A new affiliate application is waiting for review in the Admin → Affiliates tab.</p>
        <table>
          <tr><td><strong>Name</strong></td><td>${name}</td></tr>
          <tr><td><strong>Email</strong></td><td>${email}</td></tr>
          <tr><td><strong>Website / Social</strong></td><td>${website || "(none)"}</td></tr>
        </table>
      `,
    }),
  }).catch(() => {});
}

/** Emails an approved affiliate their referral link and next steps. */
export async function notifyAffiliateApproved({
  name,
  email,
  refCode,
  appUrl,
  claimToken,
}: {
  name: string;
  email: string;
  refCode: string;
  appUrl: string;
  /**
   * Joins this application to whichever account redeems it. Sent here because
   * receiving mail at the address is the proof of control that signing up with
   * it is not — accounts are auto-confirmed. Null when the application is
   * already linked to an account.
   */
  claimToken?: string | null;
}) {
  if (!RESEND_API_KEY) return;
  const refLink = `${appUrl}/?ref=${refCode}`;
  const claimLink = claimToken ? `${appUrl}/affiliate?claim=${claimToken}` : null;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "You're approved — welcome to the SparkReels affiliate program",
      html: `
        <p>Hi ${name},</p>
        <p>You're approved as a SparkReels affiliate! Here's your unique referral link — share it anywhere, and you'll earn commission on every new customer who subscribes through it:</p>
        <p><a href="${refLink}"><strong>${refLink}</strong></a></p>
        ${claimLink
          ? `<p><strong>First, link this to your account.</strong> Open the link below while signed in to SparkReels — it connects your affiliate account and your earnings to your login. It only works once, and it expires in 90 days.</p>
             <p><a href="${claimLink}">${claimLink}</a></p>
             <p>Don't have a SparkReels account yet? Create one first, then come back to this link.</p>
             <p>To get paid, open the <strong>Affiliate Program</strong> page and connect your bank with Stripe. Payouts are sent monthly.</p>`
          : `<p>To get paid, sign in and open the <strong>Affiliate Program</strong> page, then connect your bank with Stripe. Payouts are sent monthly.</p>`}
        <p>Thanks for helping more agents discover SparkReels.</p>
      `,
    }),
  }).catch(() => {});
}

/**
 * A billing event worth knowing about the moment it happens.
 *
 * Every one of these was previously invisible outside the Stripe dashboard:
 * a subscription started, a card failed, someone scheduled a cancellation, or
 * a subscription ended. A cancellation you find out about a week later is a
 * conversation you have already lost.
 *
 * Deliberately one function rather than four. They differ only in a subject
 * line and a sentence, and four near-identical senders is four places to
 * update when the address changes.
 */
export type BillingEventKind =
  | "subscribed"
  | "cancel_scheduled"
  | "canceled"
  | "payment_failed";

const BILLING_COPY: Record<BillingEventKind, { subject: string; line: string; urgent: boolean }> = {
  subscribed: {
    subject: "New subscriber",
    line: "A subscription just started.",
    urgent: false,
  },
  cancel_scheduled: {
    subject: "Cancellation scheduled",
    line: "Someone has scheduled a cancellation. They keep access until the period ends, so there is still time to reach them.",
    urgent: true,
  },
  canceled: {
    subject: "Subscription canceled",
    line: "A subscription has ended. Plan allowances are now zero; any purchased add-on videos they bought separately are still on the account.",
    urgent: true,
  },
  payment_failed: {
    subject: "Payment failed",
    line: "A payment failed. Stripe will retry, but the account is marked past due in the meantime.",
    urgent: true,
  },
};

export async function notifyBillingEvent({
  kind,
  name,
  email,
  tier,
  amount,
  periodEnd,
}: {
  kind: BillingEventKind;
  name?: string | null;
  email?: string | null;
  /** Plan they were on, where the event knows it. */
  tier?: string | null;
  /** Formatted for a human — "$189.00" — not cents. */
  amount?: string | null;
  /** When their access actually ends, for a scheduled cancellation. */
  periodEnd?: string | null;
}) {
  if (!RESEND_API_KEY) return;

  const copy = BILLING_COPY[kind];
  const who = name || email || "(unknown account)";

  const rows = [
    ["Name", name || "(no name)"],
    ["Email", email || "(no email)"],
    tier ? ["Plan", tier] : null,
    amount ? ["Amount", amount] : null,
    periodEnd ? ["Access until", periodEnd] : null,
  ].filter(Boolean) as [string, string][];

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `${copy.urgent ? "⚠️ " : ""}${copy.subject} — ${who}`,
      html: `
        <p>${copy.line}</p>
        <table>
          ${rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${v}</td></tr>`).join("")}
        </table>
      `,
    }),
    // Never let a notification failure take down a webhook. Stripe retries any
    // non-2xx, so a throw here would replay the whole event — re-running the
    // profile write for the sake of an email that did not send.
  }).catch(() => {});
}
