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
          <p className="text-slate-400 text-sm">Effective date: August 15, 2026</p>
        </div>

        <div className="space-y-10 text-slate-300 leading-relaxed">
          <section>
            <p>
              SparkReels ("we," "us," or "our") operates the SparkReels platform at{" "}
              <strong className="text-white">sparkreels.ai</strong>. This Privacy Policy explains how we
              collect, use, and protect information about you when you use our services, including the
              information we access from your Google Account when you choose to connect YouTube.
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
                <strong className="text-white">Google user data:</strong> If you connect a YouTube channel, we
                access a limited set of data from your Google Account through the YouTube Data API. Section 3
                describes exactly what we access and how it is handled.
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
            <h2 className="text-xl font-semibold text-white mb-3">
              3. Google Account and YouTube Data
            </h2>
            <p className="mb-4">
              Connecting a YouTube channel is entirely optional. SparkReels is fully usable without it — you
              can create and download videos and never grant us access to your Google Account. If you do
              connect, the following applies.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">What Google user data we access</h3>
            <p className="mb-2">
              We request two permissions (OAuth scopes) from the YouTube Data API, and only these two:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-white">View your YouTube account</strong>{" "}
                (<code className="text-slate-400 text-sm">youtube.readonly</code>) — we use this for a single
                read call that returns the channel your authorization was issued for: its channel ID, channel
                title, and channel thumbnail. We display these in the app so you can confirm which channel is
                connected before publishing. We do not read your videos, comments, ratings, captions,
                subscribers, playlists, or analytics.
              </li>
              <li>
                <strong className="text-white">Manage your YouTube videos</strong>{" "}
                (<code className="text-slate-400 text-sm">youtube.upload</code>) — we use this to upload a
                video you created in SparkReels to your channel, with the title, description, tags, and
                privacy setting you choose, and to set the custom thumbnail you selected. We upload only when
                you explicitly publish a specific video.
              </li>
            </ul>
            <p className="mt-3">
              We also store the OAuth access and refresh tokens Google issues, so that scheduled publishing
              works without asking you to re-authorize each time.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">How we use Google user data</h3>
            <p>
              Google user data is used for one purpose only: to provide the YouTube publishing feature you
              asked for. We do not use it for advertising, profiling, credit or lending decisions, resale, or
              market research. We do not use Google user data — raw, aggregated, or anonymized — to develop,
              improve, or train any artificial intelligence or machine learning model.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">
              How Google user data is shared and transferred
            </h3>
            <p>
              We do not sell, rent, or transfer Google user data to any third party. In particular, Google
              user data is never sent to our AI vendors: your channel information and OAuth tokens are not
              shared with OpenAI, HeyGen, or any other AI or machine learning service, and are not shared with
              data brokers, advertisers, or analytics providers. The only transfers of Google user data are
              (a) to Google itself, when we upload your video on your instruction, and (b) to Supabase, our
              database and hosting provider, which stores it on our behalf and does not use it for its own
              purposes. We may disclose data if required by law or to protect the safety and rights of our
              users.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">
              How Google user data is protected
            </h3>
            <p>
              Google user data is transmitted only over encrypted connections (HTTPS/TLS). It is stored in our
              Supabase database behind row-level security policies and role-based access controls, so that
              your records are accessible only to your own authenticated session and to a small number of
              administrators who require access to operate the service. Your YouTube OAuth tokens are
              additionally encrypted at rest using AES-256-GCM before they are stored, and are never exposed to
              other users or sent to the browser.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">
              Retention and deletion of Google user data
            </h3>
            <p className="mb-2">
              We retain Google user data only for as long as your YouTube channel remains connected. You can
              remove it at any time, in any of these ways:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-white">Disconnect in the app</strong> — go to Settings → Social
                Accounts and disconnect YouTube. This immediately deletes the stored access token, refresh
                token, and cached channel details from our database.
              </li>
              <li>
                <strong className="text-white">Revoke access at Google</strong> — visit{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  myaccount.google.com/permissions
                </a>{" "}
                and remove SparkReels. This revokes our tokens at Google immediately.
              </li>
              <li>
                <strong className="text-white">Delete your account</strong> — email{" "}
                <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                  support@sparkreels.ai
                </a>
                . We delete all Google user data associated with your account within 30 days.
              </li>
            </ul>
            <p className="mt-3">
              Videos already published to your YouTube channel remain on your channel and under your control;
              disconnecting SparkReels does not remove them. Manage or delete them in YouTube Studio.
            </p>

            <h3 className="text-base font-semibold text-white mt-6 mb-2">
              Google and YouTube terms that apply
            </h3>
            <p>
              SparkReels uses YouTube API Services. By connecting your channel you also agree to the{" "}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                YouTube Terms of Service
              </a>
              , and your data is handled by Google in accordance with the{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Google Privacy Policy
              </a>
              . SparkReels' use and transfer of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Services</h2>
            <p className="mb-3">
              We share data with the following providers only as needed to deliver the service. As stated in
              Section 3, Google user data is never shared with our AI vendors.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-white">Supabase</strong> — database, file storage, and authentication.
              </li>
              <li>
                <strong className="text-white">HeyGen</strong> — AI video generation from your voice and
                avatar. Receives your voice recordings and avatar selection. Receives no Google user data.
              </li>
              <li>
                <strong className="text-white">OpenAI</strong> — script generation and content enhancement.
                Receives your prompts and script text. Receives no Google user data.
              </li>
              <li>
                <strong className="text-white">Stripe</strong> — secure payment processing. Receives your
                billing details. Receives no Google user data.
              </li>
              <li>
                <strong className="text-white">Social platforms</strong> (Instagram, Facebook, LinkedIn,
                TikTok, YouTube) — only when you connect an account and authorize posting, and only the
                content you choose to publish.
              </li>
            </ul>
            <p className="mt-3">We do not sell your personal information to any third party.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Retention and Deletion</h2>
            <p>
              Your account data, voice recordings, and generated videos are retained while your account is
              active. You may delete individual videos at any time from the platform. To delete your entire
              account and associated data, contact us at{" "}
              <a href="mailto:support@sparkreels.ai" className="text-blue-400 hover:text-blue-300">
                support@sparkreels.ai
              </a>
              ; we complete deletion within 30 days. Retention and deletion of Google user data is described
              in Section 3 and can be triggered by you at any time by disconnecting YouTube.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Your Rights</h2>
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
            <h2 className="text-xl font-semibold text-white mb-3">7. Security</h2>
            <p>
              We use industry-standard security measures including encrypted connections (HTTPS), secure
              authentication via Supabase, row-level security policies, and role-based access controls. No
              method of transmission over the internet is 100% secure, and we cannot guarantee absolute
              security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Children's Privacy</h2>
            <p>
              SparkReels is not directed at children under 13. We do not knowingly collect personal
              information from children under 13. If you believe we have inadvertently collected such
              information, please contact us immediately.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by
              posting the new policy on this page with an updated effective date. Continued use of SparkReels
              after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Contact Us</h2>
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
