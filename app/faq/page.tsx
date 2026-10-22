import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList, FaqSchema } from "@/components/marketing/faq-list";
import { FAQ_GROUPS } from "@/lib/marketing/content";
import { canonicalUrl } from "@/lib/seo/public-pages";

const title = "SparkReels FAQ: AI Video for Real Estate Agents";
const description =
  "Answers about SparkReels: AI avatar videos, your Digital Twin and cloned voice, pricing, AutoSparks, posting to social media, Fair Housing and privacy.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl("/faq") },
  openGraph: { title, description, url: canonicalUrl("/faq"), type: "website" },
};

/**
 * Every question in one place, in groups (2026-10-22). This page carries the
 * FAQ search tags for all of them; the landing page's short list does not.
 */
export default function FaqPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteNav active="faq" />
      <FaqSchema items={FAQ_GROUPS.flatMap((g) => g.items)} />
      <section className="pt-28 pb-14 px-4 sm:px-6">
        <div className="max-w-[1000px] mx-auto">
          <p className="text-lg font-bold text-blue-900 uppercase tracking-widest mb-3">FAQ</p>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4">Questions agents ask</h1>
          <p className="text-xl text-slate-500 mb-8">
            Can&apos;t find yours? Email <a href="mailto:support@sparkreels.ai" className="font-semibold text-blue-900 hover:underline">support@sparkreels.ai</a>.
          </p>
          <nav aria-label="Topics" className="mb-10 flex flex-wrap gap-2">
            {FAQ_GROUPS.map((g, i) => (
              <a key={g.title} href={`#faq-${i}`} className="rounded-full border border-slate-200 px-4 py-1.5 text-base font-semibold text-slate-700 hover:border-blue-900 hover:text-blue-900">
                {g.title}
              </a>
            ))}
          </nav>
          {FAQ_GROUPS.map((g, i) => (
            <div key={g.title} id={`faq-${i}`} className="mb-10 scroll-mt-24">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-4">{g.title}</h2>
              <FaqList items={g.items} schema={false} openFirst={false} />
            </div>
          ))}
        </div>
      </section>
      <CtaBand />
      <SiteFooter />
    </div>
  );
}
