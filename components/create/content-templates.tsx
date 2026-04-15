"use client";

import {
  Home, Tag, Gem, Truck, TrendingUp, Building2,
  ArrowDownToLine, HardHat, Shield, UserCheck,
  CalendarDays, Music2, Utensils, Trees, BookOpen,
  Newspaper, Store, GraduationCap, ShoppingBag, Heart,
  Sun, Star,
} from "lucide-react";

export type TemplateCategory = "general" | "location" | "community";

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
    color: "bg-blue-50", iconColor: "text-blue-500",
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
    color: "bg-purple-50", iconColor: "text-purple-500",
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
    color: "bg-teal-50", iconColor: "text-teal-600",
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
    color: "bg-indigo-50", iconColor: "text-indigo-500",
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

  // ── Location-specific ─────────────────────────────────────────────────────
  {
    id: "neighborhood_spotlight",
    label: "Neighborhood Spotlight",
    emoji: "🌇",
    icon: Star,
    topic: "Neighborhood spotlight on {city}, {state} — lifestyle, walkability, local amenities, and what makes it unique",
    description: "Parks, dining, commute, vibe, demographics",
    color: "bg-sky-50", iconColor: "text-sky-500",
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
    color: "bg-blue-50", iconColor: "text-blue-600",
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
    color: "bg-violet-50", iconColor: "text-violet-500",
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
    id: "music_arts",
    label: "Music & Arts Events",
    emoji: "🎵",
    icon: Music2,
    topic: "Live music, art galleries, and cultural events happening in {city}, {state} — a local's entertainment guide",
    description: "Concerts, galleries, performing arts, local artists",
    color: "bg-fuchsia-50", iconColor: "text-fuchsia-500",
    category: "community",
    needsLocation: true,
  },
  {
    id: "family_activities",
    label: "Family Activities",
    emoji: "👨‍👩‍👧",
    icon: Heart,
    topic: "Best family-friendly activities and free things to do with kids in {city}, {state} this season",
    description: "Kid-friendly venues, free events, seasonal fun",
    color: "bg-rose-50", iconColor: "text-rose-500",
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
    id: "school_news",
    label: "School & Education News",
    emoji: "📚",
    icon: BookOpen,
    topic: "Latest school district news and education updates in {city}, {state} — ratings, bond elections, new programs",
    description: "District updates, bond measures, new schools",
    color: "bg-blue-50", iconColor: "text-blue-500",
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
    color: "bg-teal-50", iconColor: "text-teal-600",
    category: "community",
    needsLocation: true,
  },
];

const CATEGORIES: { key: TemplateCategory; label: string; emoji: string }[] = [
  { key: "general",   label: "Real Estate Tips",          emoji: "🏡" },
  { key: "location",  label: "Location Spotlight",         emoji: "📍" },
  { key: "community", label: "Local Events & Community News", emoji: "🎉" },
];

interface ContentTemplatesProps {
  onSelect: (template: ContentTemplate) => void;
  city?: string;
  state?: string;
}

function substitutePlaceholders(text: string, city?: string, state?: string): string {
  let result = text;
  if (city) result = result.replace(/\{city\}/g, city);
  if (state) result = result.replace(/\{state\}/g, state);
  // Clean up any remaining unfilled placeholders so they never reach the API
  result = result.replace(/\{city\}/g, "your city");
  result = result.replace(/\{state\}/g, "your state");
  return result;
}

export function ContentTemplates({ onSelect, city, state }: ContentTemplatesProps) {
  const hasLocation = !!(city?.trim() && state?.trim());

  return (
    <div className="flex flex-col gap-5">
      {!hasLocation && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Fill in City &amp; State below first — templates will auto-insert your location into the topic.
        </p>
      )}

      {CATEGORIES.map(({ key, label, emoji }) => {
        const templates = CONTENT_TEMPLATES.filter((t) => t.category === key);
        return (
          <div key={key}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {emoji} {label}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((template) => {
                const Icon = template.icon;
                const previewTopic = substitutePlaceholders(template.topic, city?.trim(), state?.trim());
                const resolvedTemplate: ContentTemplate = { ...template, topic: previewTopic };

                return (
                  <button
                    key={template.id}
                    onClick={() => onSelect(resolvedTemplate)}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:border-primary-400 hover:bg-primary-50/50 transition-all text-left group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${template.color} group-hover:scale-105 transition-transform`}>
                      <Icon size={15} className={template.iconColor} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-brand-text leading-tight">
                        {template.emoji} {template.label}
                      </p>
                      <p className="text-xs text-slate-400 leading-snug mt-0.5 line-clamp-2">
                        {template.description}
                      </p>
                      {template.needsLocation && hasLocation && (
                        <p className="text-[10px] text-primary-500 font-medium mt-0.5">
                          📍 {city}, {state}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
