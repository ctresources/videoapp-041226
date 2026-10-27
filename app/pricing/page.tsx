import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";
import { PricingSection, pricingTiers } from "@/components/marketing/pricing-section";
import { PRICING_FAQS } from "@/lib/marketing/content";
import { SITE_URL, canonicalUrl } from "@/lib/seo/public-pages";

const title = "SparkReels Pricing: AI Video Plans for Real Estate Agents";
const description =
  "Plans from $99 a month: AI avatar videos, unlimited blog posts and camera recordings, AutoSparks and posting to every platform. No contract, cancel anytime. Start free.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl("/pricing") },
  openGraph: { title, description, url: canonicalUrl("/pricing"), type: "website" },
};

/** The plans as a software offer, for search results (2026-10-22). */
function ProductSchema() {
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SparkReels.ai",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${SITE_URL}/`,
    offers: pricingTiers.map((t) => ({
      "@type": "Offer",
      name: `${t.name} plan`,
      price: t.price.replace(/[^0-9.]/g, ""),
      priceCurrency: "USD",
      url: canonicalUrl("/pricing"),
    })),
  }).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteNav active="pricing" />
      <ProductSchema />
      <div className="pt-16" />
      {/* The section's own heading is an h2, shared with the landing page. */}
      <h1 className="sr-only">SparkReels pricing for real estate agents</h1>
      <PricingSection />
      <section className="py-14 px-4 sm:px-6 border-b border-slate-200">
        <div className="max-w-[1000px] mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-6">Pricing questions</h2>
          <FaqList items={PRICING_FAQS} />
          <p className="mt-5 text-lg">
            <Link href="/faq" className="font-semibold text-[#A3660F] hover:underline">All questions →</Link>
          </p>
        </div>
      </section>
      <CtaBand title="Start free. Upgrade when you're ready." />
      <SiteFooter />
    </div>
  );
}
