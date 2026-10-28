import { FeatureGate } from "@/components/access/feature-gate";

/** Paid plans only (lib/access.ts); a free account sees the Locked card. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="video_email" name="Video Email">{children}</FeatureGate>;
}
