import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/seo/public-pages";

// The page is a client component, so its canonical tag is set here.
export const metadata: Metadata = {
  alternates: { canonical: canonicalUrl("/affiliates/apply") },
};

export default function AffiliateApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
