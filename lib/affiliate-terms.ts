/**
 * The SparkReels.ai Affiliate Program Terms (2026-11-07, the owner's wording,
 * approved as drafted). Changing the wording means a new TERMS_VERSION, and
 * every affiliate accepts it again before new referrals and payouts resume.
 */
export const AFFILIATE_TERMS_VERSION = "2026-11-06";

export const AFFILIATE_TERMS_INTRO =
  'These Terms are an agreement between you and CT Resources LLC, doing business as SparkReels.ai ("SparkReels.ai," "we," "us"). By joining the SparkReels.ai Affiliate Program (the "Program") or sharing your referral link, you accept these Terms. If you don\'t agree, don\'t take part.';

export const AFFILIATE_TERMS: { title: string; body: string }[] = [
  {
    title: "1. Who can take part.",
    body: "You can take part while all of these are true: you have an active, paid SparkReels.ai subscription; you are at least 18 and able to enter a binding agreement; you are not a SparkReels.ai employee or contractor; and taking part is lawful where you live. We may approve, decline or remove anyone at our discretion. Your affiliate account is personal and can't be transferred or sold.",
  },
  {
    title: "2. Your referral link.",
    body: "You get a referral link and code. A customer counts as your referral when they sign up through your link and become a paying subscriber. If they used more than one affiliate's link, the last one before they signed up counts. You can't refer yourself, your own other accounts, or someone who is already a customer.",
  },
  {
    title: "3. What you earn.",
    body: "You earn 20% of each subscription payment a referral makes to SparkReels.ai during their first 12 months. Refunds, chargebacks and disputed payments are taken back from your earnings. Commissions become available after a holding period and are paid monthly to the bank account you connect through Stripe, which you must keep connected and in good standing to be paid.",
  },
  {
    title: "4. If your plan ends.",
    body: "While you aren't a paid subscriber, your affiliate account is paused. Earnings you already have are kept and paid when you subscribe again, but payments your referrals make while you're paused don't earn a commission.",
  },
  {
    title: "5. How you may promote SparkReels.ai.",
    body: 'Be honest, and say you earn a commission when you share your link (for example "#ad" or "I earn a commission"). Don\'t make false or misleading claims about SparkReels.ai, its features or its prices. Don\'t send spam, buy ads on the SparkReels.ai name or misspellings of it, or present yourself as SparkReels.ai. Follow the laws and platform rules that apply to you.',
  },
  {
    title: "6. Changes to these Terms.",
    body: "We may update these Terms. When we do, the new version appears on your Affiliate page, and new referrals and payouts wait until you accept it. Earnings you already have stay yours.",
  },
  {
    title: "7. Leaving or removal.",
    body: "You can leave at any time. We may end your participation if you break these Terms, and commissions from referrals that broke them are forfeited.",
  },
  {
    title: "8. Taxes.",
    body: "You're an independent contractor, not an employee or partner of SparkReels.ai, and you're responsible for your own taxes. We may ask for tax information, such as a W-9, before paying you.",
  },
  {
    title: "9. Liability.",
    body: "The Program is provided as is. As far as the law allows, our total liability to you under these Terms is limited to the commissions owed to you in the 12 months before the claim.",
  },
  {
    title: "10. Governing law.",
    body: "These Terms are governed by the laws of Pennsylvania. Questions: support@sparkreels.ai.",
  },
];

/** Whether this affiliate has accepted the current version of the Terms. */
export function acceptedAffiliateTerms(aff: { terms_version?: string | null } | null | undefined): boolean {
  return aff?.terms_version === AFFILIATE_TERMS_VERSION;
}
