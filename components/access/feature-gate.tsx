import type { ReactNode } from "react";
import { canAccessFeature, type FeatureKey } from "@/lib/access";
import { getServerAccess } from "@/lib/access-server";
import { LockedFeature } from "@/components/access/locked-feature";

/**
 * Renders children only for an account allowed `feature`; anyone else gets
 * the fallback (the Locked card unless one is given). Checked on the server,
 * so a locked page's content is never sent to the browser — typing the
 * address does not get around it.
 *
 * Used as a route's layout.tsx for paid pages:
 *   export default function Layout({ children }) {
 *     return <FeatureGate feature="autosparks" name="AutoSparks">{children}</FeatureGate>;
 *   }
 */
export async function FeatureGate({
  feature, name, fallback, children,
}: { feature: FeatureKey; name?: string; fallback?: ReactNode; children: ReactNode }) {
  const { level } = await getServerAccess();
  if (canAccessFeature(level, feature)) return <>{children}</>;
  return <>{fallback ?? <div className="py-6"><LockedFeature feature={name} /></div>}</>;
}
