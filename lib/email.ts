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
}: {
  name: string;
  email: string;
  refCode: string;
  appUrl: string;
}) {
  if (!RESEND_API_KEY) return;
  const refLink = `${appUrl}/?ref=${refCode}`;
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
        <p>To get paid, sign in and open the <strong>Affiliate Program</strong> page, then connect your bank with Stripe. Payouts are sent monthly.</p>
        <p>Thanks for helping more agents discover SparkReels.</p>
      `,
    }),
  }).catch(() => {});
}
