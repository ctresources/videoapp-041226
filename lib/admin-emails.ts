import {
  SIGNOFF_HTML, SIGNOFF_TEXT, previewEmails,
  notifyAffiliateApproved, notifyAffiliateCommission, notifyPostFailed, notifyTrialWindow,
  sendAiQuestionsToVisitor, sendAutopilotWeek, sendFreeFollowupEmail, sendImportAddress, sendWelcomeEmail, sendVideoReadyEmail, sendAccountCleanupWarning,
  type CapturedEmail,
} from "@/lib/email";

/**
 * Admin → Emails (2026-10-24, the owner's mockup): saved replies turned into
 * email, and the list of emails SparkReels sends, previewed exactly as sent.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** **bold**, and bare links and email addresses made clickable, on escaped text. */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (u) => `<a href="${u.replace(/^https:\/\/SparkReels\.ai/i, "https://www.sparkreels.ai")}">${u}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]+\w)/g, '$1<a href="mailto:$2">$2</a>');
}

const firstNameOf = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";

/**
 * A saved reply as an email. The body is plain text: blank lines between
 * paragraphs, "- " for bullets, **bold**, {{first_name}}. The standard
 * sign-off is added when the reply leaves out the support address.
 */
export function renderReply(body: string, name: string | null | undefined): { html: string; text: string } {
  const first = firstNameOf(name);
  let text = body.replace(/\{\{\s*first_name\s*\}\}/gi, first).replace(/\r\n/g, "\n").trim();
  if (!/support@sparkreels\.ai/i.test(text)) text = `${text}\n\n${SIGNOFF_TEXT}`;

  const blocks = text.split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    if (lines.every((l) => /^\s*-\s+/.test(l))) {
      return `<ul style="margin:0 0 14px;padding-left:20px">${lines.map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
    }
    // A heading line followed by bullets: keep them together.
    const bulletAt = lines.findIndex((l) => /^\s*-\s+/.test(l));
    if (bulletAt > 0 && lines.slice(bulletAt).every((l) => /^\s*-\s+/.test(l))) {
      return `<p style="margin:0 0 6px">${lines.slice(0, bulletAt).map(inline).join("<br>")}</p>` +
        `<ul style="margin:0 0 14px;padding-left:20px">${lines.slice(bulletAt).map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 14px">${lines.map(inline).join("<br>")}</p>`;
  }).join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;font-size:15px;line-height:1.6">${blocks}</div>`;
  return { html, text: text.replace(/\*\*(.+?)\*\*/g, "$1") };
}

export const fillSubject = (subject: string, name: string | null | undefined) =>
  subject.replace(/\{\{\s*first_name\s*\}\}/gi, firstNameOf(name));

/** What plan an account is on, as the pricing page names it. */
export function planName(tier: string | null | undefined): string {
  switch (tier) {
    case "starter": return "Creator";
    case "agent": return "Producer";
    case "pro": return "Influencer";
    case "agency": return "Agency";
    default: return "Free";
  }
}

const APP = "https://www.sparkreels.ai";
const SAMPLE = { email: "jane@example.com", name: "Jane Agent" };

/** Every automatic email to customers, with how to build a sample of it. */
export const EMAIL_CATALOG: { key: string; name: string; goesTo: string; when: string; build: () => Promise<unknown> }[] = [
  { key: "welcome", name: "Welcome", goesTo: "New customer", when: "First paid plan",
    build: () => sendWelcomeEmail({ ...SAMPLE, tier: "agent" }) },
  { key: "followup-1", name: "Free follow-up 1", goesTo: "Free account, no video yet", when: "Day 2",
    build: () => sendFreeFollowupEmail({ ...SAMPLE, city: "Springfield", step: 1, unsubscribeUrl: `${APP}/unsubscribe/sample` }) },
  { key: "followup-2", name: "Free follow-up 2", goesTo: "Free account, no video yet", when: "Day 5",
    build: () => sendFreeFollowupEmail({ ...SAMPLE, city: "Springfield", step: 2, unsubscribeUrl: `${APP}/unsubscribe/sample` }) },
  { key: "followup-3", name: "Free follow-up 3", goesTo: "Free account, no video yet", when: "Day 10",
    build: () => sendFreeFollowupEmail({ ...SAMPLE, city: "Springfield", step: 3, unsubscribeUrl: `${APP}/unsubscribe/sample` }) },
  { key: "trial-warning", name: "Free days ending soon", goesTo: "Free account", when: "A few days before the 14 free days end",
    build: () => notifyTrialWindow({ ...SAMPLE, stage: "warning", daysLeft: 3, appUrl: APP }) },
  { key: "trial-ended", name: "Free days ended", goesTo: "Free account", when: "When the 14 free days end",
    build: () => notifyTrialWindow({ ...SAMPLE, stage: "ended", daysLeft: 0, appUrl: APP }) },
  { key: "autosparks", name: "AutoSparks are ready", goesTo: "Paid, AutoSparks on", when: "Monday morning",
    build: () => sendAutopilotWeek({ ...SAMPLE, videos: 2, blogs: 1, monday: "2026-10-26" }) },
  { key: "video-ready", name: "Your video is ready", goesTo: "Agent", when: "A video finishes and they aren't in the app",
    build: () => sendVideoReadyEmail({ ...SAMPLE, title: "Springfield Events This Week", url: `${APP}/videos` }) },
  { key: "cleanup-30", name: "Videos removed in 30 days", goesTo: "Free account quiet 6 months, or canceled", when: "30 days before cleanup",
    build: () => sendAccountCleanupWarning({ ...SAMPLE, daysLeft: 30, dueAt: "2026-12-01T12:00:00Z", videos: 4, reason: "inactive_free", appUrl: APP }) },
  { key: "cleanup-7", name: "Videos removed in 7 days", goesTo: "Same accounts, not back yet", when: "7 days before cleanup",
    build: () => sendAccountCleanupWarning({ ...SAMPLE, daysLeft: 7, dueAt: "2026-12-01T12:00:00Z", videos: 4, reason: "canceled", appUrl: APP }) },
  { key: "post-failed", name: "Post didn't go out", goesTo: "Agent", when: "When a social post fails",
    build: () => notifyPostFailed({ ...SAMPLE, platform: "Facebook", title: "Springfield market update", reason: "Facebook needs the Page reconnected.", appUrl: APP }) },
  { key: "import-address", name: "Import address", goesTo: "Agent", when: "When they press Email this address to me",
    build: () => sendImportAddress({ ...SAMPLE, address: "jane-k7m3qz@in.sparkreels.ai" }) },
  { key: "affiliate-approved", name: "Affiliate approved", goesTo: "New affiliate", when: "On approval",
    build: () => notifyAffiliateApproved({ ...SAMPLE, refCode: "JANE20", appUrl: APP, claimToken: null }) },
  { key: "commission", name: "Commission earned", goesTo: "Affiliate", when: "Each commission",
    build: () => notifyAffiliateCommission({ ...SAMPLE, commissionCents: 2600, availableAt: "2026-11-24T00:00:00Z", appUrl: APP }) },
  { key: "ai-questions", name: "AI questions", goesTo: "Website visitor", when: "Home page lead form",
    build: () => sendAiQuestionsToVisitor({
      ...SAMPLE, city: "Springfield",
      blocks: [
        { question: "Is Springfield a good place to buy a home right now?", answerBlock: "A short answer written for your website appears here.", videoTopic: "Buying in Springfield this fall" },
        { question: "How fast are homes selling in Springfield?", answerBlock: "A short answer written for your website appears here.", videoTopic: "" },
        { question: "What does it cost to sell a home in Springfield?", answerBlock: "A short answer written for your website appears here.", videoTopic: "" },
      ],
    }) },
];

/** One catalog email, built and captured, never sent. */
export async function previewCatalogEmail(key: string): Promise<CapturedEmail | null> {
  const entry = EMAIL_CATALOG.find((e) => e.key === key);
  if (!entry) return null;
  const captured = await previewEmails(entry.build);
  return captured[0] ?? null;
}

export { SIGNOFF_HTML };
