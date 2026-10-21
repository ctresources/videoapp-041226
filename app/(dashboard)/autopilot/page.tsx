import { redirect } from "next/navigation";

/** The old address of AutoSparks (renamed 2026-10-21), kept so a saved link still works. */
export default function AutopilotRedirect() {
  redirect("/autosparks");
}
