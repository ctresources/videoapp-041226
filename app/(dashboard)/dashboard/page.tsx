import { redirect } from "next/navigation";

/**
 * The Dashboard is part of Spark Insights now (2026-10-14, at the owner's
 * ask): its plan bar, checklist, recent projects and shortcuts are at the top
 * of that page. The address stays so old links and bookmarks still land.
 */
export default function DashboardMoved() {
  redirect("/analytics");
}
