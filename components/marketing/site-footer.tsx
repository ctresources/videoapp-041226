import Image from "next/image";
import Link from "next/link";
import { FEATURE_PAGES } from "@/lib/marketing/content";

/** The public site's footer, shared by the landing page and the new pages (2026-10-22). */
export function SiteFooter() {
  const col = "flex flex-col gap-2";
  const a = "hover:text-white transition-colors";
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 px-4 sm:px-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start gap-10 mb-8 pb-8 border-b border-slate-800">
          <div>
            <Image src="/sparkreels-logo-dark.png" alt="SparkReels.ai — Speak. Spark. Share." width={200} height={40} unoptimized />
            <p className="text-xl mt-2 text-slate-400 max-w-sm">
              Stop being invisible and become the go-to expert in your market!
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-16 gap-y-8 text-lg">
            <div className={col}>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Features</p>
              {FEATURE_PAGES.map((f) => (
                <Link key={f.slug} href={`/${f.slug}`} className={a}>{f.navLabel}</Link>
              ))}
            </div>
            <div className={col}>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">SparkReels</p>
              <Link href="/pricing" className={a}>Pricing</Link>
              <Link href="/blog" className={a}>Blog</Link>
              <Link href="/faq" className={a}>FAQ</Link>
              <Link href="/affiliates/apply" className={a}>Affiliates</Link>
            </div>
            <div className={col}>
              <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Account</p>
              <Link href="/beta" className={a}>Start Free</Link>
              <Link href="/login" className={a}>Log In</Link>
              <Link href="/privacy" className={a}>Privacy Policy</Link>
              <Link href="/terms" className={a}>Terms of Service</Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-lg text-slate-600">
          <p>© {new Date().getFullYear()} SparkReels.ai. All rights reserved.</p>
          <p>All AI-generated content includes Fair Housing compliance guardrails per 42 U.S.C. § 3604.</p>
        </div>
      </div>
    </footer>
  );
}
