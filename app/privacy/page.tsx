import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — SparkReels",
  description: "How SparkReels collects, uses, and protects your personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-8 inline-block">
            ← Back to SparkReels
          </Link>
          <h1 className="text-4xl font-bold text-white mb-3">Privacy Policy</h1>
          <p className="text-slate-400 text-sm">Effective date: June 14, 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 leading-relaxed">
          <section>
            <p>
              SparkReels ("we," "us," or "our") operates the SparkReels platform at{" "}
              <strong className="text-white">sparkreels.ai</strong>. This Privacy Policy explains how we
              collect, use, and protect information about you when you use our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-white">Account information:</strong> Your name and email address when
                you register or sign in with Google.
              </li>
              <li>
                <strong className="text-white">Voice recordings:</strong> Audio you record within the app to
                generate video content.
              </li>
              <li>
                <strong className="text-white">Generated content:</strong> Videos, scripts, and thumbnails
                created through our platform.
              </li>
              <li>
                <strong className="text-white">Billing information:</strong> Payment details processed
                securely by Stripe. We do not store your card number.
              </li>
              <li>
                <strong className="text-white">Usage data:</strong> Pages visited, features used, and
                interaction logs to improve the service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To generate AI-powered video content from your voice recordings.</li>
              <li>To post content to social media platforms on your behalf when authorized.</li>
              <li>To process payments and manage your subscription.</li>
              <li>To send transactional emails (receipts, password resets, service notices).</li>
              <li>To improve and debug the SparkReels platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Third-Party Services</h2>
            <p className="mb-3">We share data with the following providers only as needed to deliver the service:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-white">Supabase</strong> — database, file storage, and authentication.
              </li>
              <li>
                <strong className="text-white">HeyGen</strong> — AI video generation from your voice and avatar.
              </li>
              <li>
                <strong className="text-white">OpenAI</strong> — script generation and content enhancement.
              </li>
              <li>
                <strong className="text-white">Stripe</strong> — secure payment processing.
              </li>
              <li>
                <strong className="text-white">Social platforms</strong> (Instagram, Facebook, LinkedIn,
                TikTok, YouTube) — only when you connect an account and authorize posting.
              </li>
            </ul>
            <p className="mt-3">We do not sell your personal information to any third party.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Data Retention</h2>
            <p>
              Your account data, voice recordings, and generated videos are retained while your account is
              active. You may delete individual videos at any time from the platform. To delete your entire
              account and associated data, contact us at{" "}
              <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                support@sparkreels.ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your account and data.</li>
              <li>Withdraw consent for social media posting at any time by disconnecting your accounts.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                support@sparkreels.ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Security</h2>
            <p>
              We use industry-standard security measures including encrypted connections (HTTPS), secure
              authentication via Supabase, and role-based access controls. No method of transmission over the
              internet is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Children's Privacy</h2>
            <p>
              SparkReels is not directed at children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have inadvertently collected such
              information, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by
              posting the new policy on this page with an updated effective date. Continued use of SparkReels
              after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact Us</h2>
            <p>
              For any questions about this Privacy Policy or your data, contact us at:
            </p>
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
