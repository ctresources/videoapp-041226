import { FeaturePageView, featureMetadata } from "@/components/marketing/feature-page";

// A public feature page (2026-10-22). Its words are in lib/marketing/content.ts.
export const metadata = featureMetadata("digital-twin");

export default function Page() {
  return <FeaturePageView slug="digital-twin" />;
}
