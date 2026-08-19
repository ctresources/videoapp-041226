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
    id: "day_in_life_vlog",
    label: "Day-in-the-Life Vlog",
    emoji: "🎥",
    icon: Clapperboard,
    topic: "A day in the life of living in {city}, {state} — vlog-style walkthrough of a typical morning, favorite coffee spots, neighborhoods, commute, and what daily life really feels like",
    description: "Casual first-person vlog: morning-to-evening local life",
    color: "bg-rose-50", iconColor: "text-rose-500",
    category: "format",
    needsLocation: true,
  },
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
    color: "bg-spark-blue/10", iconColor: "text-spark-blue",
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

// "format" is deliberately absent — the formats have their own row above the
// browser, and listing them twice was just noise.
const CATEGORIES: { key: TemplateCategory; label: string }[] = [
  { key: "general",   label: "Real estate tips" },
  { key: "location",  label: "Location spotlight" },
  { key: "community", label: "Local events & community news" },
];

/** Topic templates only — the formats have their own row, so they aren't counted. */
export const TEMPLATE_COUNT = CONTENT_TEMPLATES.filter((t) => t.category !== "format").length;

interface ContentTemplatesProps {
  /**
   * Receives the template with `topic` already resolved for display, and the
   * untouched `{city}`/`{state}` original as the second argument — the page
   * keeps that so a location typed *after* picking a template still lands.
   */
  onSelect: (template: ContentTemplate, rawTopic: string) => void;
  city?: string;
  state?: string;
  /** Whether the full categorised browser is open. Controlled by the page. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

export function substitutePlaceholders(text: string, city?: string, state?: string): string {
  let result = text;
  if (city) result = result.replace(/\{city\}/g, city);
  if (state) result = result.replace(/\{state\}/g, state);
  // Clean up any remaining unfilled placeholders so they never reach the API
  result = result.replace(/\{city\}/g, "your city");
  result = result.replace(/\{state\}/g, "your state");
  return result;
}

/** Monospace section kicker + right-hand link, shared by every section. */
export function SectionHead({
  label,
  action,
  onAction,
}: {
  label: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.13em] text-spark-ink-muted">
        {label}
      </p>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="flex-none text-[13px] font-medium text-spark-amber hover:text-spark-blue"
        >
          {action}
        </button>
      )}
    </div>
  );
}

/** The six video shapes — topic ideas in their own right, not a modifier. */
export const VIDEO_FORMATS = CONTENT_TEMPLATES.filter((t) => t.category === "format");

export function ContentTemplates({
  onSelect,
  city,
  state,
  expanded = false,
  onToggleExpanded,
}: ContentTemplatesProps) {
  const hasLocation = !!(city?.trim() && state?.trim());

  function resolve(template: ContentTemplate): ContentTemplate {
    return {
      ...template,
      topic: substitutePlaceholders(template.topic, city?.trim(), state?.trim()),
    };
  }

  return (
    <div id="topic-templates" className="flex flex-col gap-5 scroll-mt-6">
      {/* ── Video formats ──
          These are topic ideas like any other — a shape you can make a video
          about — so they sit with the templates rather than in a separate
          step. Tapping one fills the topic. */}
      <div className="flex flex-col gap-2.5">
        <SectionHead label="Video formats" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {VIDEO_FORMATS.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelect(resolve(template), template.topic)}
              className="flex flex-col gap-1 rounded-[9px] border border-spark-rule bg-white px-3.5 py-3 text-left transition-colors hover:border-spark-amber hover:bg-spark-amber-tint"
            >
              <span className="text-[14px] font-medium text-spark-ink">{template.label}</span>
              <span className="text-[12.5px] leading-[1.4] text-spark-ink-faint">
                {template.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <SectionHead
        label="More topic ideas"
        action={expanded ? "Hide them" : `Browse all ${TEMPLATE_COUNT} ›`}
        onAction={onToggleExpanded}
      />

      {expanded && (
        <div className="flex flex-col gap-5">
          {!hasLocation && (
            <p className="rounded-[9px] border border-spark-rule bg-spark-amber-tint px-3.5 py-2.5 text-[13px] text-spark-ink-muted">
              Add your city and state above and these will fill your location into the topic for
              you.
            </p>
          )}

          {CATEGORIES.map(({ key, label }) => {
            const templates = CONTENT_TEMPLATES.filter((t) => t.category === key);
            return (
              <div key={key} className="flex flex-col gap-2.5">
                <SectionHead label={label} />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onSelect(resolve(template), template.topic)}
                      className="flex flex-col gap-1 rounded-[9px] border border-spark-rule bg-white px-3.5 py-3 text-left transition-colors hover:border-spark-amber hover:bg-spark-amber-tint"
                    >
                      <span className="text-[14px] font-medium leading-[1.35] text-spark-ink">
                        {template.label}
                      </span>
                      <span className="text-[12.5px] leading-[1.4] text-spark-ink-faint">
                        {template.description}
                      </span>
                      {template.needsLocation && hasLocation && (
                        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-spark-amber">
                          {city}, {state}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
