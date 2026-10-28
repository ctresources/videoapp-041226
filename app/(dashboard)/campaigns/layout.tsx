import { FeatureGate } from "@/components/access/feature-gate";

/**
 * Paid plans only (lib/access.ts), on top of the page's own feature_access
 * grant. A free account sees the Locked card.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="spark_calendar" name="Spark Calendar">{children}</FeatureGate>;
}
