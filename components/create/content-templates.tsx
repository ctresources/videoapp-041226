"use client";

import {
  Home, Tag, Gem, Truck, TrendingUp, Building2,
  ArrowDownToLine, HardHat, Shield, UserCheck,
  CalendarDays, Music2, Utensils, Trees, BookOpen,
  Newspaper, Store, GraduationCap, ShoppingBag, Heart,
  Sun, Star, Clapperboard, ListOrdered, Scale, Map, DoorOpen, HelpCircle,
} from "lucide-react";

export type TemplateCategory = "general" | "format" | "location" | "community";

export interface ContentTemplate {
  id: string;
  label: string;
  emoji: string;
  icon: React.ElementType;
  topic: string;           // May contain {city} and {state} placeholders
  description: string;
  color: string;
  iconColor: string;
  category: TemplateCategory;
  needsLocation?: boolean; // hints that {city}/{state} should be filled first
}

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  // ── General real estate ───────────────────────────────────────────────────
  {
    id: "homebuyer_tips",
    label: "Homebuyer Tips",
    emoji: "🏠",
    icon: Home,
    topic: "Top homebuyer tips and common mistakes to avoid when purchasing a home",
    description: "Pre-approval, inspections, negotiation, closing costs",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "general",
  },
  {
    id: "seller_tips",
    label: "Home Seller Tips",
    emoji: "🏷️",
    icon: Tag,
    topic: "Essential home seller tips for pricing, staging, and getting top dollar",
    description: "Pricing strategy, staging, listing photos, offers",
    color: "bg-green-50", iconColor: "text-green-600",
    category: "general",
  },
  {
    id: "luxury_sellers",
    label: "Luxury Sellers",
    emoji: "💎",
    icon: Gem,
    topic: "Luxury home selling strategies, marketing, and what high-end buyers expect",
    description: "High-end marketing, buyer profiles, concierge service",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "general",
  },
  {
    id: "relocation_tips",
    label: "Relocation Tips",
    emoji: "🚚",
    icon: Truck,
    topic: "Relocation tips for people moving to {city}, {state} from out of state or out of town",
    description: "Neighborhood research, remote work, cost comparison",
    color: "bg-orange-50", iconColor: "text-orange-500",
    category: "general",
    needsLocation: true,
  },
  {
    id: "market_conditions",
    label: "Buyer vs Seller Market",
    emoji: "📈",
    icon: TrendingUp,
    topic: "How to know if it's a buyer's market or seller's market in {city}, {state} right now and what it means for you",
    description: "Market timing, negotiation leverage, strategy",
    color: "bg-red-50", iconColor: "text-red-500",
    category: "general",
    needsLocation: true,
  },
  {
    id: "investment_property",
    label: "Investment Property",
    emoji: "💰",
    icon: Building2,
    topic: "Investment property tips in {city}, {state} — rental income, ROI, cap rates, and what to look for",
    description: "ROI, rental yields, cap rates, due diligence",
    color: "bg-yellow-50", iconColor: "text-yellow-600",
    category: "general",
    needsLocation: true,
  },
  {
    id: "downsizing",
    label: "Downsizing Guide",
    emoji: "📉",
    icon: ArrowDownToLine,
    topic: "Downsizing guide for empty nesters in {city}, {state} — how to right-size your home and simplify your life",
    description: "Right-sizing, decluttering, emotional journey",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "general",
    needsLocation: true,
  },
  {
    id: "new_construction",
    label: "New Construction",
    emoji: "🏗️",
    icon: HardHat,
    topic: "New construction homes vs resale in {city}, {state} — builder incentives, warranties, upgrade packages, and timelines",
    description: "Builder deals, upgrades, warranties, timelines",
    color: "bg-amber-50", iconColor: "text-amber-600",
    category: "general",
    needsLocation: true,
  },
  {
    id: "va_loans",
    label: "VA Loan Benefits",
    emoji: "🎖️",
    icon: Shield,
    topic: "VA loan benefits for veterans and active military in {city}, {state} — zero down, eligibility, and how to use it",
    description: "Zero down, eligibility, funding fee, process",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "general",
    needsLocation: true,
  },
  {
    id: "first_time_buyers",
    label: "First-Time Buyers",
    emoji: "🔑",
    icon: UserCheck,
    topic: "First-time homebuyer programs and down payment assistance available in {city}, {state}",
    description: "Down payment help, FHA loans, step-by-step process",
    color: "bg-pink-50", iconColor: "text-pink-500",
    category: "general",
    needsLocation: true,
  },

  // ── Video style formats ───────────────────────────────────────────────────
  {
    id: "listicle",
    label: "Listicle (Top 5)",
    emoji: "🔢",
    icon: ListOrdered,
    topic: "Top 5 things you need to know before moving to {city}, {state} — a numbered countdown with quick, punchy facts and one surprising item at the end",
    description: "Numbered countdown format — fast, snackable, shareable",
    color: "bg-amber-50", iconColor: "text-amber-600",
    category: "format",
    needsLocation: true,
  },
  {
    id: "pros_cons",
    label: "Pros & Cons",
    emoji: "⚖️",
    icon: Scale,
    topic: "The honest pros and cons of living in {city}, {state} — a balanced breakdown of cost of living, lifestyle, weather, jobs, schools, and housing, ending with who it's right for",
    description: "Balanced two-sided breakdown — builds trust and authority",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "format",
    needsLocation: true,
  },
  {
    id: "map_video",
    label: "Map Video",
    emoji: "🗺️",
    icon: Map,
    topic: "Map tour of {city}, {state} — breaking down the best areas and neighborhoods as if pointing at a map: where to live by budget, lifestyle, commute, and schools, area by area",
    description: "Area-by-area neighborhood breakdown, map-style visuals",
    color: "bg-emerald-50", iconColor: "text-emerald-600",
    category: "format",
    needsLocation: true,
  },
  {
    id: "home_tour",
    label: "Home Tour",
    emoji: "🚪",
    icon: DoorOpen,
    topic: "Narrated home tour of a featured listing in {city}, {state} — a room-by-room walkthrough highlighting standout features, finishes, layout, and the lifestyle each space offers",
    description: "Room-by-room walkthrough — pairs great with listing photos",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "format",
    needsLocation: true,
  },
  {
    // Added for the quick-start chips on Create, which needed a
    // new-listing announcement and had nothing to point at — every existing
    // format was a tour, a tip or a roundup. It stands on its own outside
    // those chips too: it is the single most-posted kind of agent video.
    id: "just_listed",
    label: "Just Listed",
    emoji: "🏡",
    icon: Star,
    topic: "A just-listed announcement for a new property in {city}, {state} — the address and price, the three things that make it stand out, who it suits, and how to book a showing",
    description: "Announce a new listing — price, standout features, showings",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "format",
    needsLocation: true,
  },
  {
    id: "qa_myth_buster",
    label: "Q&A / Myth-Buster",
    emoji: "❓",
    icon: HelpCircle,
    topic: "Answering the questions buyers and sellers in {city}, {state} keep asking — and correcting the most common myths about the local market, pricing, timing, and what agents actually do",
    description: "Answer the question clients keep asking",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "format",
    needsLocation: true,
  },

  // ── Location-specific ─────────────────────────────────────────────────────
  {
    id: "neighborhood_spotlight",
    label: "Neighborhood Spotlight",
    emoji: "🌇",
    icon: Star,
    topic: "Neighborhood spotlight on {city}, {state} — lifestyle, walkability, local amenities, and what makes it unique",
    description: "Parks, dining, commute, vibe, demographics",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "location",
    needsLocation: true,
  },
  {
    id: "best_schools",
    label: "Best Schools",
    emoji: "🎓",
    icon: GraduationCap,
    topic: "Top-rated public and private schools in {city}, {state} — ratings, programs, and what families should know",
    description: "School ratings, magnet programs, private options",
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
    category: "location",
    needsLocation: true,
  },
  {
    id: "cost_of_living",
    label: "Cost of Living",
    emoji: "💵",
    icon: ShoppingBag,
    topic: "Cost of living in {city}, {state} vs national average — housing, groceries, taxes, and utilities",
    description: "Affordability breakdown, taxes, everyday costs",
    color: "bg-green-50", iconColor: "text-green-600",
    category: "location",
    needsLocation: true,
  },
  {
    id: "best_restaurants",
    label: "Local Dining Scene",
    emoji: "🍽️",
    icon: Utensils,
    topic: "Best restaurants, food halls, and dining experiences in {city}, {state} — a local's guide",
    description: "Hidden gems, brunch spots, trending restaurants",
    color: "bg-orange-50", iconColor: "text-orange-500",
    category: "location",
    needsLocation: true,
  },
  {
    id: "parks_outdoors",
    label: "Parks & Outdoors",
    emoji: "🌳",
    icon: Trees,
    topic: "Best parks, trails, and outdoor activities in {city}, {state} for families and nature lovers",
    description: "Trails, lakes, green spaces, family activities",
    color: "bg-emerald-50", iconColor: "text-emerald-600",
    category: "location",
    needsLocation: true,
  },

  // ── Local events & community news ────────────────────────────────────────
  {
    id: "monthly_events",
    label: "Monthly Events",
    emoji: "📅",
    icon: CalendarDays,
    topic: "Upcoming local events and things to do in {city}, {state} this month — festivals, markets, and community gatherings",
    description: "What's happening this month locally",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "community",
    needsLocation: true,
  },
  {
    id: "farmers_markets",
    label: "Farmers Markets",
    emoji: "🥕",
    icon: Sun,
    topic: "Best farmers markets in {city}, {state} — locations, hours, vendors, and seasonal highlights",
    description: "Weekly markets, artisan vendors, seasonal produce",
    color: "bg-lime-50", iconColor: "text-lime-600",
    category: "community",
    needsLocation: true,
  },

  {
    id: "new_businesses",
    label: "New Business Openings",
    emoji: "🏪",
    icon: Store,
    topic: "New businesses, shops, and restaurants opening in {city}, {state} — what's coming to your neighborhood",
    description: "Grand openings, local businesses, retail trends",
    color: "bg-yellow-50", iconColor: "text-yellow-600",
    category: "community",
    needsLocation: true,
  },
  {
    id: "development_projects",
    label: "Development Projects",
    emoji: "🏢",
    icon: Building2,
    topic: "New real estate development and construction projects planned for {city}, {state} — what's being built and when",
    description: "Mixed-use, residential, commercial projects",
    color: "bg-slate-50", iconColor: "text-slate-500",
    category: "community",
    needsLocation: true,
  },
  {
    id: "local_news_roundup",
    label: "Community News Roundup",
    emoji: "📰",
    icon: Newspaper,
    topic: "Community news roundup for {city}, {state} — infrastructure, city council decisions, parks, and local improvements",
    description: "Roads, city projects, zoning changes, local gov",
    color: "bg-spark-amber-tint", iconColor: "text-spark-amber",
    category: "community",
    needsLocation: true,
  },
];

/** Topic templates only — the formats have their own row, so they aren't counted. */
export const TEMPLATE_COUNT = CONTENT_TEMPLATES.filter((t) => t.category !== "format").length;

export function substitutePlaceholders(text: string, city?: string, state?: string): string {
  let result = text;
  if (city) result = result.replace(/\{city\}/g, city);
  if (state) result = result.replace(/\{state\}/g, state);
  // Clean up any remaining unfilled placeholders so they never reach the API
  result = result.replace(/\{city\}/g, "your city");
  result = result.replace(/\{state\}/g, "your state");
  return result;
}
