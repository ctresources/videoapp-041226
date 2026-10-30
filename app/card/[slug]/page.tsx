import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardColor, cardReviewsOn, cardTitle, loadCardBySlug } from "@/lib/card/card";
import { CardView } from "@/components/card/card-view";

export const dynamic = "force-dynamic";

/** The public Video Business Card (2026-10-30): /card/<slug>. */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const card = await loadCardBySlug(createAdminClient(), params.slug);
  if (!card) return { title: "Card not found" };
  const name = card.profile.full_name || "Your agent";
  const desc = [cardTitle(card), card.profile.company_name, [card.profile.location_city, card.profile.location_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  return {
    title: `${name} · ${cardTitle(card)}`,
    description: desc,
    robots: { index: false },
    openGraph: { title: name, description: desc, ...(card.video?.poster || card.profile.avatar_url ? { images: [card.video?.poster || card.profile.avatar_url!] } : {}) },
  };
}

export default async function CardPage({ params }: { params: { slug: string } }) {
  const card = await loadCardBySlug(createAdminClient(), params.slug);
  if (!card) notFound();
  return <CardView
    // The plan and role decide what shows; they never go to the browser.
    card={{ ...card, profile: { ...card.profile, subscription_tier: null, role: null } }}
    color={cardColor(card)} title={cardTitle(card)} showReviews={cardReviewsOn(card)}
  />;
}
