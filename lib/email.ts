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

/**
 * Tells the owner the render account is out of money — the one failure no
 * customer can fix and no retry will clear.
 *
 * Sent at the moment a render is refused, because the alternative is finding
 * out from a support message. The agent's own message says nothing about
 * balances; this is the half of it that goes to whoever can act.
 */
export async function notifyRenderBalanceLow({
  balanceUsd,
  estimatedUsd,
  userEmail,
}: {
  balanceUsd: number | null;
  estimatedUsd: number | null;
  userEmail?: string | null;
}) {
  if (!RESEND_API_KEY) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `Render account out of funds — a video was just refused`,
      html: `<p>A render was <strong>blocked before submitting</strong> because the
             render account cannot cover it.</p>
             <ul>
               <li>Balance: <strong>$${balanceUsd ?? "unknown"}</strong></li>
               <li>This render needed: <strong>$${estimatedUsd ?? "unknown"}</strong></li>
               ${userEmail ? `<li>Affected user: ${userEmail}</li>` : ""}
             </ul>
             <p>Nothing was charged to their allowance and no credit was spent.
             They were told to try again shortly, so this stays invisible to them
             until it is fixed — top up the render account, or check that
             auto-reload's card is still good.</p>`,
    }),
  }).catch(() => {});
}

/**
 * Voice cloning was refused because the account has no slots left.
 *
 * Sent because the alternative is what happened the first time: an agent tries
 * four times in a row, gives up, and the owner hears about it by chance. The
 * agent's own message says nothing about plans or slots — this is the half
 * that goes to whoever can act on it.
 */
export async function notifyVoiceCloneUnavailable({
  userEmail,
  detail,
}: {
  userEmail?: string | null;
  detail: string;
}) {
  if (!RESEND_API_KEY) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: "Voice cloning refused — the account is out of voice slots",
      html: `<p>Someone recorded a voice sample and the clone was <strong>refused</strong>:
             the render account has no voice-clone slots left. Slots come from the web
             plan tier, not from API credits, so this affects every user until the plan
             changes.</p>
             <ul>
               ${userEmail ? `<li>Affected user: ${userEmail}</li>` : ""}
               <li>Supplier said: ${detail.slice(0, 300)}</li>
             </ul>
             <p>They were told voice cloning is not available right now and that their
             videos will use a natural stock voice — nothing was charged and nothing is
             broken for them beyond this one feature.</p>`,
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
      // So the reply button reaches support rather than noreply@.
      reply_to: NOTIFY_EMAIL,
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
        <p>Any questions, please send us an email at
        <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a> and we will respond within 2 days.</p>
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

/**
 * The free window is closing, or has closed.
 *
 * Sent TO THE AGENT, not the owner — one of the few here that is. The 30 days
 * of camera recording and AI tools that a free video unlocks used to end with
 * no word at all: the tiles locked, and whoever had drifted away never learned
 * why. Two emails, each sent once, tracked by the columns in migration 040.
 *
 * Deliberately plain. This is the moment someone decides whether to pay, and a
 * countdown dressed up as a celebration reads as a sales trick.
 */
export async function notifyTrialWindow({
  email,
  name,
  stage,
  daysLeft,
  appUrl,
}: {
  email: string;
  name: string | null;
  /** "warning" — a few days left. "ended" — the window has closed. */
  stage: "warning" | "ended";
  daysLeft: number;
  appUrl: string;
}) {
  if (!RESEND_API_KEY) return false;

  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi,";
  const plans = `${appUrl}/billing`;
  const dayWord = daysLeft === 1 ? "day" : "days";

  const subject = stage === "warning"
    ? `${daysLeft} ${dayWord} left of your camera recording and AI tools`
    : "Your free 30 days have ended";

  // Sent from noreply@, so there was no way to ask a question. Said in both.
  const contact = `<p>Any questions, please send us an email at
       <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a> and we will respond within 2 days.</p>`;

  const html = stage === "warning"
    ? `<p>${hi}</p>
       <p>Your free video opened 30 days of unlimited camera recording, the AI tools and the
       article writer. <strong>${daysLeft} ${dayWord}</strong> of that is left.</p>
       <p>If you want to keep recording, writing articles and making videos after that, pick a
       plan and nothing stops.</p>
       <p><a href="${plans}">See the plans</a></p>
       <p>If you'd rather not, nothing happens — the videos you have made stay yours, and your
       account stays open.</p>
       ${contact}`
    : `<p>${hi}</p>
       <p>Your 30 days of unlimited camera recording, AI tools and article writing have ended.</p>
       <p>Everything you made is still in your account and still yours. To record, write or
       generate anything new, pick a plan.</p>
       <p><a href="${plans}">See the plans</a></p>
       ${contact}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    // Sent from noreply@, so Reply went nowhere. Most people press the reply
    // button before they read a footer; this makes that button work.
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html, reply_to: NOTIFY_EMAIL }),
  }).catch(() => null);

  // The caller only marks the column when this is true, so a failed send is
  // retried by tomorrow's run rather than silently counted as delivered.
  return !!res?.ok;
}

/**
 * Send someone their own import address.
 *
 * The point is not the message — it is that afterwards the address exists in
 * their mail client, where forwarding actually happens. Their autocomplete
 * learns it, Reply goes to it, and on a phone that removes the only awkward
 * step: copying an address out of a settings screen in another app.
 *
 * Reply-To is the import address itself rather than support@, which is the one
 * place in this app where that is right: replying to this email is the thing we
 * are asking them to do.
 */
export async function sendImportAddress({
  email,
  name,
  address,
}: {
  email: string;
  name: string | null;
  address: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  const hi = name ? `Hi ${name.split(" ")[0]},` : "Hi,";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      reply_to: address,
      subject: "Your SparkReels import address",
      html: `
        <p>${hi}</p>
        <p>This is the address that turns an email into an article you can use:</p>
        <p style="font-size:17px"><strong><a href="mailto:${address}">${address}</a></strong></p>
        <p>Forward anything to it — a newsletter, a market report, an article someone sent
        you. It appears in SparkReels within a minute, under <strong>From email</strong>,
        with the signatures, forwarding headers and unsubscribe footers taken out.</p>
        <p>Two things worth doing once: save this address to your contacts, and keep this
        email — replying to it goes straight to your import address.</p>
        <p>It is private to your account. Anyone who has it can send articles into your
        list, so treat it like a password; you can replace it any time in Settings.</p>
        <p>Any questions, please send us an email at
        <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a> and we will respond within 2 days.</p>
      `,
    }),
  }).catch(() => null);

  return !!res?.ok;
}

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
