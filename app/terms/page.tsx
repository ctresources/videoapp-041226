import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — SparkReels",
  description: "Terms and conditions for using the SparkReels platform.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-8 inline-block">
            ← Back to SparkReels
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">Terms of Service</h1>
          <p className="text-slate-400 text-sm">Effective date: June 14, 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 leading-relaxed">
          <section>
            <p>
              By accessing or using SparkReels at{" "}
              <strong className="text-white">sparkreels.ai</strong>, you agree to be bound by these Terms of
              Service. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Description of Service</h2>
            <p>
              SparkReels is an AI-powered platform that allows real estate professionals to convert voice
              recordings into video content and distribute that content to social media channels. Features
              include voice-to-video generation, AI scripting, avatar creation, and automated social posting.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years old to use SparkReels. By using the service, you represent that
              you are of legal age and have the authority to enter into this agreement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Acceptable Use</h2>
            <p className="mb-3">You agree to use SparkReels only for lawful purposes. You must not:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Upload or generate content that is illegal, defamatory, or infringes on third-party rights.</li>
              <li>Use the platform to spam, harass, or mislead others.</li>
              <li>Attempt to reverse-engineer, scrape, or disrupt the service.</li>
              <li>Share your account credentials with others.</li>
              <li>Use AI-generated content in ways that violate the terms of connected social platforms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Your Content</h2>
            <p>
              You retain ownership of voice recordings and any original content you upload. By using
              SparkReels, you grant us a limited license to process your content solely for the purpose of
              delivering the service (generating videos, posting to social media on your behalf). We do not
              claim ownership of your content and do not use it to train AI models without your consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Subscriptions and Billing</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Paid plans are billed monthly or annually via Stripe.</li>
              <li>Subscriptions auto-renew unless cancelled before the renewal date.</li>
              <li>You can cancel your subscription at any time from your account settings.</li>
              <li>Refunds are handled on a case-by-case basis — contact support@sparkreels.ai.</li>
              <li>We reserve the right to change pricing with 30 days' notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. AI-Generated Content Disclaimer</h2>
            <p>
              SparkReels uses artificial intelligence to generate scripts, videos, and other content.
              AI-generated content may contain inaccuracies or errors. You are solely responsible for
              reviewing all generated content before publishing or sharing it. SparkReels is not liable for
              any consequences resulting from the accuracy, completeness, or legality of AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Third-Party Platforms</h2>
            <p>
              SparkReels integrates with third-party social media platforms. Your use of those platforms is
              governed by their own terms of service. We are not responsible for changes to third-party APIs,
              account suspensions, or posting failures caused by those platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violations of these
              Terms. You may delete your account at any time by contacting{" "}
              <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                support@sparkreels.ai
              </a>
              . Upon termination, your data will be deleted in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, SparkReels shall not be liable for any indirect,
              incidental, special, or consequential damages arising from your use of the service. Our total
              liability to you shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes via email
              or an in-app notice. Continued use of SparkReels after changes constitutes acceptance of the
              revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
            <p>Questions about these Terms? Contact us at:</p>
            <div className="mt-3 p-4 bg-slate-900 rounded-lg border border-slate-800">
              <p className="font-semibold text-white">SparkReels</p>
              <p>
                Email:{" "}
                <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                  support@sparkreels.ai
                </a>
              </p>
              <p>Website: sparkreels.ai</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
