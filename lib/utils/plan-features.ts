/**
 * Which plans unlock which features.
 *
 * Digital twins are the expensive one: training costs money at HeyGen before a
 * single video renders, and twin renders bill at a higher per-second rate than
 * photo avatars. They are an Agent/Pro feature, so the gate lives here and is
 * applied at creation, at render time, and in the settings UI — one definition
 * rather than three opinions.
 */
export const DIGITAL_TWIN_TIERS = ["agent", "pro"] as const;

export function canUseDigitalTwin(tier: string | null | undefined, role?: string | null): boolean {
  if (role === "admin") return true;
  return (DIGITAL_TWIN_TIERS as readonly string[]).includes(tier ?? "free");
}

export const DIGITAL_TWIN_UPGRADE_MESSAGE =
  "Digital twins are available on the Agent and Pro plans. Your photo avatar works on every plan — upgrade in Billing to train a twin.";
