import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle } from "lucide-react";
import { FEATURE_PAGES, type FeaturePage } from "@/lib/marketing/content";
import { SITE_URL } from "@/lib/seo/public-pages";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CtaBand } from "@/components/marketing/cta-band";
import { FaqList } from "@/components/marketing/faq-list";

function page(slug: string): FeaturePage {
  const p = FEATURE_PAGES.find((f) => f.slug === slug);
  if (!p) notFound();
  return p;
}

/** Title, description, canonical and share card for a feature page. */
export function featureMetadata(slug: string): Metadata {
  const p = page(slug);
  const url = `${SITE_URL}/${p.slug}`;
  return {
    title: `${p.metaTitle} | SparkReels`,
    description: p.metaDescription,
    alternates: { canonical: url },
    openGraph: { title: p.metaTitle, description: p.metaDescription, url, type: "website", images: [{ url: p.image }] },
    twitter: { card: "summary_large_image", title: p.metaTitle, description: p.metaDescription, images: [p.image] },
  };
}

/**
 * One feature page (2026-10-22, the owner's approved mockup): pitch, how it
 * works, what you get, who it's for, its own FAQs, the other features, and
 * the sign-up band. The words live in lib/marketing/content.ts.
 */
export function FeaturePageView({ slug }: { slug: string }) {
  const p = page(slug);
  const others = FEATURE_PAGES.filter((f) => f.slug !== p.slug);
  const breadcrumbs = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: p.navLabel, item: `${SITE_URL}/${p.slug}` },
    ],
  }).replace(/</g, "\\u003c");

  return (
    <div className="min-h-screen bg-white">
      <SiteNav active="features" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbs }} />

      <section className="pt-24 pb-14 px-4 sm:px-6 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <p className="mb-6 text-sm text-slate-400">
            <Link href="/" className="hover:text-slate-600">Home</Link> › {p.navLabel}
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="mb-4 flex flex-wrap items-center gap-3 text-lg sm:text-xl font-black text-blue-900">
                {p.eyebrow}
                {p.paid && <span className="rounded-full bg-[#BA7517] px-2.5 py-0.5 text-sm font-semibold text-white">Paid plans</span>}
              </p>
              <h1 className="text-4xl sm:text-6xl font-black leading-[1.08] mb-5 text-slate-900">
                {p.h1}
                <span className="block text-blue-900 mt-1">{p.h1Accent}</span>
              </h1>
              <p className="text-xl text-slate-500 mb-7 leading-relaxed max-w-xl">{p.lead}</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/beta" className="inline-flex items-center justify-center gap-2 bg-blue-900 text-white text-xl font-semibold px-7 py-4 hover:bg-blue-800 transition-colors">
                  Sign up for free <ArrowRight size={18} />
                </Link>
                <Link href="/pricing" className="inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-700 text-xl font-semibold px-7 py-4 hover:border-slate-400 hover:bg-slate-50 transition-colors">
                  See pricing
                </Link>
              </div>
              <p className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-base font-bold px-4 py-2 rounded-full mt-5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                First 100 agents get 1 free AI video — no credit card
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt={p.imageAlt} className="w-full h-[320px] sm:h-[460px] object-cover rounded-2xl shadow-xl" />
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-8">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {p.steps.map((s, i) => (
              <div key={s.title} className="border border-slate-200 p-6">
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-lg font-black text-[#BA7517]">{i + 1}</span>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{s.title}</h3>
                <p className="text-lg text-slate-500 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10">
          {[{ title: p.getsTitle, list: p.gets }, { title: p.forTitle, list: p.forList }].map((col) => (
            <div key={col.title}>
              <h2 className="text-3xl font-black text-slate-900 mb-5">{col.title}</h2>
              <ul className="space-y-3">
                {col.list.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-lg text-slate-700">
                    <CheckCircle size={18} className="mt-1 shrink-0 text-[#BA7517]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 border-b border-slate-200">
        <div className="max-w-[1000px] mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 mb-6">Questions agents ask</h2>
          <FaqList items={p.faqs} />
          <p className="mt-5 text-lg">
            <Link href="/faq" className="font-semibold text-blue-900 hover:underline">All questions →</Link>
          </p>
        </div>
      </section>

      <section className="py-14 px-4 sm:px-6 bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto">
          <h2 className="text-3xl font-black text-slate-900 mb-6">More from SparkReels</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {others.map((f) => (
              <Link key={f.slug} href={`/${f.slug}`} className="block border border-slate-200 bg-white p-5 hover:border-blue-900 transition-colors">
                <span className="block text-lg font-bold text-slate-900">{f.navLabel}</span>
                <span className="block text-base text-slate-500">{f.blurb}</span>
              </Link>
            ))}
            <Link href="/pricing" className="block border border-slate-200 bg-white p-5 hover:border-blue-900 transition-colors">
              <span className="block text-lg font-bold text-slate-900">Pricing</span>
              <span className="block text-base text-slate-500">Plans from $99 a month</span>
            </Link>
          </div>
        </div>
      </section>

      <CtaBand />
      <SiteFooter />
    </div>
  );
}
