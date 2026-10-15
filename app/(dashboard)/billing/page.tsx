import { redirect } from "next/navigation";

/**
 * Billing is a tab of Settings now (2026-10-14). This address stays because
 * Stripe sends people back here after paying (with ?success= and the like)
 * and many buttons point at it; everything is passed on to the tab.
 */
export default function BillingMoved({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (typeof v === "string") qs.set(k, v);
  }
  const q = qs.toString();
  redirect(`/settings/billing${q ? `?${q}` : ""}`);
}
