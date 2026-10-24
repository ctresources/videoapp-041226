/** The kinds of Halo page, shared by the server and the AutoSparks page. */

export type HaloKind =
  | "blog" | "guides" | "events" | "market"
  | "neighborhoods" | "communities" | "relocation" | "dining" | "just_sold" | "other";

export const HALO_KINDS: { id: HaloKind; label: string }[] = [
  { id: "blog", label: "Blog" },
  { id: "guides", label: "Guides" },
  { id: "events", label: "Events" },
  { id: "market", label: "Market report" },
  { id: "neighborhoods", label: "Neighborhoods" },
  { id: "communities", label: "Communities" },
  { id: "relocation", label: "Relocation" },
  { id: "dining", label: "Dining" },
  { id: "just_sold", label: "Just sold" },
  { id: "other", label: "Any new page" },
];

export const kindLabel = (k: string) => HALO_KINDS.find((x) => x.id === k)?.label ?? "Page";
