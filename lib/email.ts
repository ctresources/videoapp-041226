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

/**
 * Voice clone slots running low.
 *
 * Sent at 80% and on each new voice after that, the same way the social
 * capacity email works. Slots come from the HeyGen web plan and are shared
 * by every customer, so the fix is a plan change, not code.
 */
export async function notifyVoiceSlotsNearlyFull({ used, limit }: { used: number; limit: number }) {
  if (!RESEND_API_KEY) return;
  const full = used >= limit;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: full
        ? `Voice clones are FULL: ${used} of ${limit} used`
        : `Voice clones are ${Math.round((used / limit) * 100)}% full: ${used} of ${limit} used`,
      html: `<p><strong>${used}</strong> of ${limit} HeyGen voice clone slots are in use.</p>
             <p>When they run out, a new user's recording is still saved, but their videos use a
             stock voice until a slot frees up. Free accounts give theirs back on their own; paying
             accounts and admins keep theirs.</p>
             <p>To add room, move up a plan in HeyGen (Pro holds 70). If you do, set
             <code>HEYGEN_VOICE_CLONE_LIMIT</code> in Vercel to the new number so this count stays right.</p>`,
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
}): Promise<boolean> {
  // Returns whether Resend accepted it (2026-10-17), so the admin screen can
  // say "emailed" only when it was.
  if (!RESEND_API_KEY) return false;
  const refLink = `${appUrl}/?ref=${refCode}`;
  const claimLink = claimToken ? `${appUrl}/affiliate?claim=${claimToken}` : null;
  const res = await fetch("https://api.resend.com/emails", {
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
  }).catch(() => null);
  if (!res?.ok) {
    console.error(`[affiliate] approval email to ${email} failed: ${res ? `HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` : "network error"}`);
    return false;
  }
  return true;
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
    : "Your free 14 days have ended";

  // Sent from noreply@, so there was no way to ask a question. Said in both.
  const contact = `<p>Any questions, please send us an email at
       <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a> and we will respond within 2 days.</p>`;

  const html = stage === "warning"
    ? `<p>${hi}</p>
       <p>Your free video opened 14 days of unlimited camera recording, the AI tools and the
       article writer. <strong>${daysLeft} ${dayWord}</strong> of that is left.</p>
       <p>If you want to keep recording, writing articles and making videos after that, pick a
       plan and nothing stops.</p>
       <p><a href="${plans}">See the plans</a></p>
       <p>If you'd rather not, nothing happens — the videos you have made stay yours, and your
       account stays open.</p>
       ${contact}`
    : `<p>${hi}</p>
       <p>Your 14 days of unlimited camera recording, AI tools and article writing have ended.</p>
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

/**
 * Tells the owner the publishing plan is running out of customer slots.
 *
 * The plan holds a fixed number of connected customers and refuses the next
 * one outright: no overage, no automatic upgrade. A customer who hits that
 * sees "at capacity" and can do nothing about it, so the owner hears at 80%,
 * while there is still room to move up a tier, and again if it ever fills.
 */
export async function notifySocialCapacity({ used, limit }: { used: number; limit: number }) {
  if (!RESEND_API_KEY) return;
  const full = used >= limit;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: full
        ? `Social publishing is FULL: ${used} of ${limit} customer slots used`
        : `Social publishing is ${Math.round((used / limit) * 100)}% full: ${used} of ${limit} slots`,
      html: full
        ? `<p>All <strong>${limit}</strong> Upload-Post profiles are in use. The next customer who tries to
           connect their accounts will be told we're at capacity.</p>
           <p>Move up a tier at <a href="https://app.upload-post.com/pricing">app.upload-post.com/pricing</a>.
           No code change is needed.</p>`
        : `<p><strong>${used}</strong> of ${limit} Upload-Post profiles are in use.</p>
           <p>When they run out, new customers can't connect their accounts. Move up a tier before then at
           <a href="https://app.upload-post.com/pricing">app.upload-post.com/pricing</a>.</p>`,
    }),
  }).catch(() => {});
}

/**
 * A post that did not go out.
 *
 * Sent when a platform refuses a post after it was handed over, which is
 * minutes after the agent pressed Publish and usually after they have moved
 * on. Says which platform, which video, the reason in the same plain sentence
 * the app shows, and where to put it right. No partner is named: the reason is
 * already written without one.
 */
export async function notifyPostFailed({
  email,
  name,
  platform,
  title,
  reason,
  appUrl,
  photos = false,
}: {
  email: string;
  name: string | null;
  /** As the agent knows it: "Facebook", "Instagram". */
  platform: string;
  title: string | null;
  reason: string | null;
  appUrl: string;
  /** A photo post, which has no video in My Sparks to retry from. */
  photos?: boolean;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  // The title is the agent's own words and goes into HTML.
  const safe = (text: string) => text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hi = name ? `Hi ${safe(name.split(" ")[0])},` : "Hi,";
  const what = title ? `&ldquo;${safe(title)}&rdquo;` : "Your post";
  const why = reason ? safe(reason) : `${safe(platform)} didn't accept it.`;

  const html = `<p>${hi}</p>
     <p>${what} was sent to ${safe(platform)}, but it didn't post.</p>
     <p><strong>${why}</strong></p>
     ${photos
       ? `<p>Once that's sorted, post the photos again from where you sent them.</p>
     <p><a href="${appUrl}/videos">Open SparkReels</a></p>`
       : `<p>Once that's sorted, open My Sparks, press Publish on the video, and use Retry beside
     ${safe(platform)}.</p>
     <p><a href="${appUrl}/videos">Open My Sparks</a></p>`}
     <p>Any questions, please send us an email at
     <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a> and we will respond within 2 days.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL, to: email,
      subject: `Your ${platform} post didn't go out`,
      html, reply_to: NOTIFY_EMAIL,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

// ── Affiliate activity (2026-10-16, the owner's ask) ────────────────────────
// Sign-ups through an affiliate's link and commissions earned used to show
// only in the Admin panel. Names and emails here come from sign-up forms, so
// they are escaped before going into the HTML.

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

/** To the owner: someone signed up through an affiliate's link. */
export async function notifyReferralSignup({
  affiliateName,
  refCode,
  userEmail,
}: {
  affiliateName: string;
  refCode: string;
  userEmail: string | null;
}) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `New sign-up through ${affiliateName}'s affiliate link`,
      html: `
        <p>Someone just signed up for SparkReels through an affiliate's link. A commission is earned when they pay.</p>
        <table>
          <tr><td><strong>Affiliate</strong></td><td>${escHtml(affiliateName)} (${escHtml(refCode)})</td></tr>
          <tr><td><strong>New user</strong></td><td>${escHtml(userEmail || "(no email)")}</td></tr>
        </table>
      `,
    }),
  }).catch(() => {});
}

/** To the owner: a referred customer paid, so a commission was earned. */
export async function notifyCommissionEarned({
  affiliateName,
  customerEmail,
  paidCents,
  commissionCents,
  availableAt,
  firstPayment,
}: {
  affiliateName: string;
  customerEmail: string | null;
  paidCents: number;
  commissionCents: number;
  availableAt: string;
  firstPayment: boolean;
}) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: `${firstPayment ? "New paying referral" : "Affiliate commission"}: ${dollars(commissionCents)} for ${affiliateName}`,
      html: `
        <p>${firstPayment ? "A customer referred by an affiliate just made their first payment." : "A customer referred by an affiliate just paid again."}</p>
        <table>
          <tr><td><strong>Affiliate</strong></td><td>${escHtml(affiliateName)}</td></tr>
          <tr><td><strong>Customer</strong></td><td>${escHtml(customerEmail || "(no email)")}</td></tr>
          <tr><td><strong>Payment</strong></td><td>${dollars(paidCents)}</td></tr>
          <tr><td><strong>Commission</strong></td><td>${dollars(commissionCents)}, payable after ${longDate(availableAt)} (the 30-day hold)</td></tr>
        </table>
        <p>It's in Admin → Affiliates. Payouts go out on the 1st of each month.</p>
      `,
    }),
  }).catch(() => {});
}

/** To the affiliate: they earned a commission. */
export async function notifyAffiliateCommission({
  name,
  email,
  commissionCents,
  availableAt,
  appUrl,
}: {
  name: string;
  email: string;
  commissionCents: number;
  availableAt: string;
  appUrl: string;
}) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      reply_to: NOTIFY_EMAIL,
      subject: `You earned a ${dollars(commissionCents)} SparkReels commission`,
      html: `
        <p>Hi ${escHtml(name)},</p>
        <p>Someone you referred just paid for SparkReels, so you've earned a <strong>${dollars(commissionCents)}</strong> commission.</p>
        <p>It becomes payable after <strong>${longDate(availableAt)}</strong> (a 30-day hold, in case of refunds). Payouts go out on the 1st of each month once you have $50 or more, to the bank account you connected with Stripe.</p>
        <p>See your earnings on your <a href="${appUrl}/affiliate">Affiliate Program page</a>.</p>
        <p>Thanks for sharing SparkReels. Any questions, email
        <a href="mailto:${NOTIFY_EMAIL}">${NOTIFY_EMAIL}</a>.</p>
      `,
    }),
  }).catch(() => {});
}

/**
 * An agent asking for the ready-made GoHighLevel workflow, from the
 * GoHighLevel card in Settings (2026-10-19). To support, with Reply going to
 * the agent. True when Resend accepted it.
 */
export async function notifyGhlWorkflowRequest({ name, email }: { name: string; email: string }): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      reply_to: email,
      subject: `GoHighLevel workflow request from ${name}`,
      html: `<p>${esc(name)} (${esc(email)}) is asking for the GoHighLevel workflow.</p><p>Reply to this email to send it to them.</p>`,
    }),
  }).catch(() => null);
  if (!res?.ok) console.error(`[ghl-workflow] request email failed: ${res ? res.status : "network error"}`);
  return !!res?.ok;
}

/**
 * A Digital Twin creation refused by HeyGen with the one-twin limit
 * (2026-10-19). HeyGen says API twins have no limit; this is the alarm if
 * that turns out wrong. To support; the detail is internal only.
 */
export async function notifyTwinRefused({ userEmail, detail }: { userEmail: string; detail: string }): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: "Digital Twin creation refused by HeyGen",
      html: `<p>A customer's Digital Twin was refused with the one-twin limit, which HeyGen said no longer applies to API twins.</p><p><b>Customer:</b> ${esc(userEmail)}</p><p><b>HeyGen said:</b> ${esc(detail.slice(0, 500))}</p><p>Worth asking HeyGen support about, quoting this message.</p>`,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

/**
 * Weekly Autopilot's Monday email (2026-10-21): the week's drafts are written
 * and waiting. Links to /autopilot, where each is approved, changed or skipped.
 */
export async function sendAutopilotWeek({
  email,
  name,
  videos,
  blogs,
  monday,
}: {
  email: string;
  name: string | null;
  videos: number;
  blogs: number;
  /** The week's Monday, "YYYY-MM-DD". */
  monday: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const first = name?.trim().split(/\s+/)[0];
  const [y, m, d] = monday.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(Date.UTC(y, m - 1, d + 6));
  const fmt = (t: Date) => t.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const parts = [
    videos ? `${videos} video${videos === 1 ? "" : "s"}` : "",
    blogs ? `${blogs} blog post${blogs === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" and ");
  const total = videos + blogs;
  const url = "https://www.sparkreels.ai/autosparks";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: email,
      subject: "Your AutoSparks are ready ✨",
      html: `
        <p><strong>Your AutoSparks are ready${first ? `, ${first}` : ""} ✨</strong></p>
        <p>${total} draft${total === 1 ? " is" : "s are"} waiting for ${fmt(start)} – ${fmt(end)}: ${parts}.
        Each has its script, blog post, title and description written. Approve, change or skip each one.</p>
        <p><a href="${url}" style="display:inline-block;background:#BA7517;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">Review my week</a></p>
        <p style="color:#6f6b60;font-size:13px">Nothing is made or posted until you approve it. You can turn AutoSparks off on that page.</p>
      `,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

/** A lead from the home page's "What buyers in your area ask AI" box (2026-10-23). */
export async function notifySiteLead({ name, email, city, questions, when }: {
  name: string;
  email: string;
  city: string;
  questions: string[];
  when: string;
}) {
  if (!RESEND_API_KEY) return;
  const at = new Date(when).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      reply_to: email,
      subject: `New lead — ${name}, ${city}`,
      html: `
        <p>A visitor asked what buyers in their area ask AI, on the sparkreels.ai home page.</p>
        <table>
          <tr><td><strong>Name</strong></td><td>${escHtml(name)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${escHtml(email)}</td></tr>
          <tr><td><strong>City</strong></td><td>${escHtml(city)}</td></tr>
          <tr><td><strong>When</strong></td><td>${escHtml(at)} ET</td></tr>
        </table>
        <p><strong>Their questions</strong></p>
        <ol>${questions.map((q) => `<li>${escHtml(q)}</li>`).join("")}</ol>
        <p>Reply to this email to write to them.</p>
      `,
    }),
  }).catch(() => {});
}

/**
 * The visitor's own copy of their questions and answers (2026-10-23).
 *
 * From the owner at support@, not noreply: the email says "just reply", and
 * a noreply sender plus HTML only is what sent the first one to Outlook's
 * junk folder. A plain-text part goes with the HTML, and one ordinary link
 * rather than a big button.
 */
const PERSONAL_FROM = "Carmella at SparkReels <support@sparkreels.ai>";

export async function sendAiQuestionsToVisitor({ name, email, city, blocks }: {
  name: string;
  email: string;
  city: string;
  blocks: { question: string; answerBlock: string; videoTopic: string }[];
}) {
  if (!RESEND_API_KEY) return;
  const firstRaw = name.split(" ")[0] || name;
  const first = escHtml(firstRaw);
  const signUp = "https://www.sparkreels.ai/beta";
  const items = blocks.map((b, i) => `
    <p style="margin:22px 0 6px;font-size:16px;font-weight:bold;color:#0f172a">${i + 1}. ${escHtml(b.question)}</p>
    <p style="margin:0 0 6px;font-size:15px;line-height:1.6;color:#334155">${escHtml(b.answerBlock)}</p>
    ${b.videoTopic ? `<p style="margin:0;font-size:14px;color:#8a5a12">Video idea: ${escHtml(b.videoTopic)}</p>` : ""}`).join("");
  const textItems = blocks.map((b, i) =>
    `${i + 1}. ${b.question}

${b.answerBlock}${b.videoTopic ? `

Video idea: ${b.videoTopic}` : ""}`).join("\n\n");
  const intro = `Thanks for trying SparkReels! Here are 3 questions buyers in ${city} are asking ChatGPT, Google and Siri right now, each with an answer written for your website.`;
  const outro = "Answering these on video is the quickest way to be the agent AI recommends. You can make your first video free here:";
  const signoff = "If you have any questions, just reply to this email. It comes straight to me.";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: PERSONAL_FROM,
      to: email,
      reply_to: NOTIFY_EMAIL,
      subject: `What buyers in ${city} ask AI`,
      text: `Hi ${firstRaw},

${intro}

${textItems}

${outro}
${signUp}

${signoff}

Carmella Thompson
Founder, SparkReels.ai

You asked for these on sparkreels.ai.`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">
          <p>Hi ${first},</p>
          <p>${escHtml(intro)}</p>
          ${items}
          <p style="margin:24px 0 4px">${escHtml(outro)}</p>
          <p style="margin:0 0 24px"><a href="${signUp}" style="color:#1e3a8a;font-weight:bold">sparkreels.ai/beta</a></p>
          <p>${escHtml(signoff)}</p>
          <p style="margin:0">Carmella Thompson<br>Founder, SparkReels.ai</p>
          <p style="margin-top:24px;font-size:12px;color:#94a3b8">You asked for these on sparkreels.ai.</p>
        </div>
      `,
    }),
  }).catch(() => {});
}

/**
 * The welcome email to a new paying customer (2026-10-23, the owner's
 * approved wording). Sent once, on their first subscription, from the owner
 * at support@ so a reply reaches her; HTML with a plain-text part.
 */
export async function sendWelcomeEmail({ email, name, tier, affiliate }: {
  email: string;
  name: string | null;
  /** starter | agent | pro */
  tier: string;
  /** Already an approved affiliate: their link and dashboard instead of the invitation. */
  affiliate?: { refLink: string; dashboardUrl: string } | null;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const plan = tier === "agent" ? "Producer" : tier === "pro" ? "Influencer" : "Creator";
  const longLine = tier === "agent" ? "2 long videos, up to 8 minutes each"
    : tier === "pro" ? "4 long videos, up to 8 minutes each" : null;
  const introLine = tier === "agent" || tier === "pro" ? "A free Agent Intro video every month" : null;
  const firstRaw = (name ?? "").trim().split(/\s+/)[0] || "there";
  const first = escHtml(firstRaw);
  const app = "https://www.sparkreels.ai";

  const monthly = [
    "4 short AI videos, up to 3 minutes each",
    longLine,
    "Unlimited blog posts and camera recordings",
    "AutoSparks: 3 posts drafted for you, ready every Monday",
    introLine,
  ].filter(Boolean) as string[];

  const steps: [string, string][] = [
    ["Finish your studio", "add your headshot and record your voice, so every video looks and sounds like you."],
    ["Make your first video", "open Spark Studio, hit the mic and say what it's about."],
    ["Turn on AutoSparks", "pick your post days, and your week of drafts arrives every Monday."],
  ];

  const h2 = "margin:26px 0 8px;font-size:16px;font-weight:bold;color:#0f172a";
  const btn = "display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">
      <p>Hi ${first},</p>
      <p>Welcome to SparkReels! Your <strong>${plan}</strong> plan is active, and you're all set to start showing up as the local expert in your market.</p>
      <p style="${h2}">Here's what's yours every month:</p>
      <ul style="margin:0;padding-left:20px">${monthly.map((m) => `<li>${escHtml(m)}</li>`).join("")}</ul>
      <p style="${h2}">Get going in 3 steps:</p>
      <ol style="margin:0;padding-left:20px">${steps.map(([b, t]) => `<li><strong>${b}:</strong> ${escHtml(t)}</li>`).join("")}</ol>
      <p style="margin:22px 0"><a href="${app}/create" style="${btn}">Open Spark Studio</a></p>
      <p style="${h2}">Put SparkReels on your phone</p>
      <p style="margin:0 0 6px">It works like an app, one tap from your home screen:</p>
      <ul style="margin:0;padding-left:20px">
        <li><strong>iPhone:</strong> open sparkreels.ai in <strong>Safari</strong>, tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>.</li>
        <li><strong>Android:</strong> open it in <strong>Chrome</strong>, tap the <strong>&#8942;</strong> menu, then <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
      </ul>
      ${affiliate ? `
      <p style="${h2}">Thanks for being a SparkReels affiliate</p>
      <p style="margin:0 0 8px">You earn <strong>20% commission</strong> on every agent who subscribes through your link, <strong>every month for their first 12 months</strong>, paid monthly straight to your bank. Here's your link to share:</p>
      <p style="margin:0 0 12px"><a href="${escHtml(affiliate.refLink)}" style="color:#1e3a8a;font-weight:bold">${escHtml(affiliate.refLink.replace(/^https?:\/\/(www\.)?/, ""))}</a></p>
      <p style="margin:0 0 22px"><a href="${escHtml(affiliate.dashboardUrl)}" style="color:#1e3a8a;font-weight:bold">See your affiliate dashboard</a></p>` : `
      <p style="${h2}">Earn while you share it</p>
      <p style="margin:0 0 12px">Know other agents who should be on video? Join the SparkReels affiliate program and earn <strong>20% commission</strong> on every customer you refer, <strong>every month for their first 12 months</strong>, paid monthly straight to your bank.</p>
      <p style="margin:0 0 22px"><a href="${app}/affiliates/apply" style="color:#1e3a8a;font-weight:bold">Become an affiliate</a></p>`}
      <p>Need help? Tap <strong>Ask Sparklee</strong> at the top of any page, read <strong>How It Works</strong>, or just reply to this email. It comes straight to me.</p>
      <p style="margin:0">Welcome aboard,<br>Carmella Thompson<br>Founder, SparkReels.ai</p>
    </div>`;

  const text = [
    `Hi ${firstRaw},`,
    "",
    `Welcome to SparkReels! Your ${plan} plan is active, and you're all set to start showing up as the local expert in your market.`,
    "",
    "Here's what's yours every month:",
    ...monthly.map((m) => `- ${m}`),
    "",
    "Get going in 3 steps:",
    ...steps.map(([b, t], i) => `${i + 1}. ${b}: ${t}`),
    "",
    `Open Spark Studio: ${app}/create`,
    "",
    "Put SparkReels on your phone",
    "It works like an app, one tap from your home screen:",
    "- iPhone: open sparkreels.ai in Safari, tap Share (the square with an arrow), then Add to Home Screen.",
    "- Android: open it in Chrome, tap the ⋮ menu, then Add to Home screen (or Install app).",
    "",
    ...(affiliate ? [
      "Thanks for being a SparkReels affiliate",
      "You earn 20% commission on every agent who subscribes through your link, every month for their first 12 months, paid monthly straight to your bank. Here's your link to share:",
      affiliate.refLink,
      `See your affiliate dashboard: ${affiliate.dashboardUrl}`,
    ] : [
      "Earn while you share it",
      "Know other agents who should be on video? Join the SparkReels affiliate program and earn 20% commission on every customer you refer, every month for their first 12 months, paid monthly straight to your bank.",
      `Become an affiliate: ${app}/affiliates/apply`,
    ]),
    "",
    "Need help? Tap Ask Sparklee at the top of any page, read How It Works, or just reply to this email. It comes straight to me.",
    "",
    "Welcome aboard,",
    "Carmella Thompson",
    "Founder, SparkReels.ai",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: PERSONAL_FROM,
      to: email,
      reply_to: NOTIFY_EMAIL,
      subject: firstRaw === "there"
        ? `Welcome to SparkReels! Your ${plan} plan is ready`
        : `Welcome to SparkReels, ${firstRaw}! Your ${plan} plan is ready`,
      html,
      text,
    }),
  }).catch(() => null);
  return !!res?.ok;
}

/**
 * Follow-ups 1–3 to a free account that hasn't made its free video
 * (2026-10-23, the owner's approved wording). The owner sends each from the
 * Admin panel. From her at support@ so a reply reaches her; HTML with a
 * plain-text part and a one-click unsubscribe link.
 */
export async function sendFreeFollowupEmail({ email, name, city, step, unsubscribeUrl }: {
  email: string;
  name: string | null;
  city: string | null;
  step: 1 | 2 | 3;
  unsubscribeUrl: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const firstRaw = (name ?? "").trim().split(/\s+/)[0] || "there";
  const first = escHtml(firstRaw);
  const cityRaw = (city ?? "").trim();
  const app = "https://www.sparkreels.ai";
  const btn = "display:inline-block;background:#1e3a8a;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px";
  const cta = `<p style="margin:22px 0"><a href="${app}/create" style="${btn}">Make my free video</a></p>`;
  const ctaText = `Make my free video: ${app}/create`;

  let subject: string;
  let bodyHtml: string;
  let bodyText: string[];

  if (step === 1) {
    subject = firstRaw === "there" ? "Your free SparkReels video is waiting" : `Your free SparkReels video is waiting, ${firstRaw}`;
    const steps: [string, string][] = [
      ["Add your headshot", "(and record your voice, so it sounds like you)."],
      ["Hit the mic", "in Spark Studio and say what it's about: a market update, a listing, a buyer tip."],
      ["Press Spark It.", "Your video is made for you, captions and all."],
    ];
    bodyHtml = `
      <p>Your free AI video is ready when you are. It takes about a minute of your time:</p>
      <ol style="margin:0;padding-left:20px">${steps.map(([b, t]) => `<li><strong>${b}</strong> ${escHtml(t)}</li>`).join("")}</ol>
      ${cta}
      <p>Questions? Just reply. It comes straight to me.</p>
      <p style="margin:0">Carmella Thompson<br>Founder, SparkReels.ai</p>`;
    bodyText = [
      "Your free AI video is ready when you are. It takes about a minute of your time:",
      ...steps.map(([b, t], i) => `${i + 1}. ${b} ${t}`),
      "",
      ctaText,
      "",
      "Questions? Just reply. It comes straight to me.",
      "",
      "Carmella Thompson",
      "Founder, SparkReels.ai",
    ];
  } else if (step === 2) {
    subject = "Not sure what to say? Here are 3 ideas";
    const ideas: [string, string][] = [
      [cityRaw ? `"What's happening in the ${cityRaw} market right now"` : `"What's happening in your market right now"`,
        "a quick update buyers and sellers love."],
      ["A 30-second Agent Intro", "tell people who you are and how you help. SparkReels writes it from your profile."],
      [cityRaw ? `"What buyers in ${cityRaw} are asking ChatGPT"` : `"What buyers in your area are asking ChatGPT"`,
        "answer one real question on video."],
    ];
    bodyHtml = `
      <p>The hardest part is picking a topic, so here are three that work for any agent:</p>
      <ul style="margin:0;padding-left:20px">${ideas.map(([b, t]) => `<li><strong>${escHtml(b)}</strong>: ${escHtml(t)}</li>`).join("")}</ul>
      <p style="margin:18px 0 0">Pick one and your free video is made for you, no filming needed.</p>
      ${cta}
      <p style="margin:0">Carmella</p>`;
    bodyText = [
      "The hardest part is picking a topic, so here are three that work for any agent:",
      ...ideas.map(([b, t]) => `- ${b}: ${t}`),
      "",
      "Pick one and your free video is made for you, no filming needed.",
      ctaText,
      "",
      "Carmella",
    ];
  } else {
    subject = "Should I keep your free video for you?";
    bodyHtml = `
      <p>Just checking in: your free AI video is still here, with your face, your voice and your market, ready in minutes.</p>
      <p>If something got in the way, reply and tell me. I read every email and I'm happy to help you make your first one.</p>
      ${cta}
      <p style="margin:0">Carmella</p>`;
    bodyText = [
      "Just checking in: your free AI video is still here, with your face, your voice and your market, ready in minutes.",
      "",
      "If something got in the way, reply and tell me. I read every email and I'm happy to help you make your first one.",
      ctaText,
      "",
      "Carmella",
    ];
  }

  const footer = "You're getting this because you signed up for SparkReels.";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">
      <p>Hi ${first},</p>
      ${bodyHtml}
      <p style="margin-top:28px;font-size:12px;color:#94a3b8">${footer} <a href="${escHtml(unsubscribeUrl)}" style="color:#94a3b8">Stop these reminders</a></p>
    </div>`;
  const text = [
    `Hi ${firstRaw},`,
    "",
    ...bodyText,
    "",
    "--",
    `${footer} Stop these reminders: ${unsubscribeUrl}`,
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: PERSONAL_FROM,
      to: email,
      reply_to: NOTIFY_EMAIL,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    }),
  }).catch(() => null);
  return !!res?.ok;
}
