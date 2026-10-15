import { redirect } from "next/navigation";

/**
 * The older Social Media page, folded into Settings → Social Accounts
 * (2026-10-14). The address stays so old links still land.
 */
export default function SocialMoved() {
  redirect("/settings/social");
}
