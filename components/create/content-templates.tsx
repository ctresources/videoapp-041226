"use client";

import {
  Home, Tag, Gem, Truck, TrendingUp, Building2,
  ArrowDownToLine, HardHat, Shield, UserCheck,
} from "lucide-react";

export interface ContentTemplate {
  id: string;
  label: string;
  emoji: string;
  icon: React.ElementType;
  topic: string;           // Pre-fills the custom topic field
  description: string;    // Shown in the card tooltip / subtitle
  color: string;          // Tailwind bg for icon container
  iconColor: string;      // Tailwind text color for icon
}

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  {
    id: "homebuyer_tips",
    label: "Homebuyer Tips",
    emoji: "🏠",
    icon: Home,
    topic: "Top homebuyer tips and common mistakes to avoid when purchasing a home",
    description: "Pre-approval, inspections, negotiation, closing costs",
    color: "bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    id: "seller_tips",
    label: "Home Seller Tips",
    emoji: "🏷️",
    icon: Tag,
    topic: "Essential home seller tips for pricing, staging, and getting top dollar",
    description: "Pricing strategy, staging, listing photos, offers",
    color: "bg-green-50",
    iconColor: "text-green-600",
  },
  {
    id: "luxury_sellers",
    label: "Luxury Sellers",
    emoji: "💎",
    icon: Gem,
    topic: "Luxury home selling strategies, marketing, and what high-end buyers expect",
    description: "High-end marketing, buyer profiles, concierge service",
    color: "bg-purple-50",
    iconColor: "text-purple-500",
  },
  {
    id: "relocation_tips",
    label: "Relocation Tips",
    emoji: "🚚",
    icon: Truck,
    topic: "Relocation tips for people moving to this area from out of state or out of town",
    description: "Neighborhood research, remote work, cost comparison",
    color: "bg-orange-50",
    iconColor: "text-orange-500",
  },
  {
    id: "market_conditions",
    label: "Buyer vs Seller Market",
    emoji: "📈",
    icon: TrendingUp,
    topic: "How to know if it's a buyer's market or seller's market and what it means for you",
    description: "Market timing, negotiation leverage, strategy",
    color: "bg-red-50",
    iconColor: "text-red-500",
  },
  {
    id: "investment_property",
    label: "Investment Property",
    emoji: "💰",
    icon: Building2,
    topic: "Investment property tips — rental income, ROI, cap rates, and what to look for",
    description: "ROI, rental yields, cap rates, due diligence",
    color: "bg-yellow-50",
    iconColor: "text-yellow-600",
  },
  {
    id: "downsizing",
    label: "Downsizing Guide",
    emoji: "📉",
    icon: ArrowDownToLine,
    topic: "Downsizing guide for empty nesters — how to right-size your home and simplify your life",
    description: "Right-sizing, decluttering, emotional journey",
    color: "bg-teal-50",
    iconColor: "text-teal-600",
  },
  {
    id: "new_construction",
    label: "New Construction",
    emoji: "🏗️",
    icon: HardHat,
    topic: "New construction homes vs resale — builder incentives, warranties, upgrade packages, and timelines",
    description: "Builder deals, upgrades, warranties, timelines",
    color: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    id: "va_loans",
    label: "VA Loan Benefits",
    emoji: "🎖️",
    icon: Shield,
    topic: "VA loan benefits for veterans and active military — zero down, eligibility, and how to use it",
    description: "Zero down, eligibility, funding fee, process",
    color: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
  {
    id: "first_time_buyers",
    label: "First-Time Buyers",
    emoji: "🔑",
    icon: UserCheck,
    topic: "First-time homebuyer programs, down payment assistance, and step-by-step buying process",
    description: "Down payment help, FHA loans, step-by-step process",
    color: "bg-pink-50",
    iconColor: "text-pink-500",
  },
];

interface ContentTemplatesProps {
  onSelect: (template: ContentTemplate) => void;
}

export function ContentTemplates({ onSelect }: ContentTemplatesProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Popular Templates — click to pre-fill
      </p>
      <div className="grid grid-cols-2 gap-2">
        {CONTENT_TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <button
              key={template.id}
              onClick={() => onSelect(template)}
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
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
