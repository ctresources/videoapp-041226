import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff access and activity (2026-10-30, the owner's ask; managed in Admin →
 * Staff activity, admins only).
 *
 * Each staff account can have its own access: publishing off, to approved
 * accounts only, or anywhere; emails on/off; AutoSparks approvals on/off.
 * Non-staff accounts are never limited by any of this.
 */

export type PublishAccess = "off" | "approved" | "any";
export interface StaffPermissions {
  publish: PublishAccess;
  /** Platform ids allowed when publish is "approved" (youtube, facebook…). */
  approved: string[];
  emails: boolean;
  autosparks: boolean;
}
export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = { publish: "any", approved: [], emails: true, autosparks: true };

export function cleanPermissions(raw: unknown): StaffPermissions {
  const r = (raw ?? {}) as Partial<StaffPermissions>;
  return {
    publish: r.publish === "off" || r.publish === "approved" ? r.publish : "any",
    approved: Array.isArray(r.approved) ? r.approved.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    emails: r.emails !== false,
    autosparks: r.autosparks !== false,
  };
}

/** The account's limits if it's staff; null for everyone else (never limited). */
export async function staffLimits(userId: string): Promise<StaffPermissions | null> {
  const { data } = await createAdminClient().from("profiles").select("role, staff_permissions").eq("id", userId).single();
  const p = data as { role: string | null; staff_permissions: unknown } | null;
  if (p?.role !== "staff") return null;
  return cleanPermissions(p.staff_permissions);
}

export const canPublishTo = (perm: StaffPermissions | null, platform: string) =>
  !perm || perm.publish === "any" || (perm.publish === "approved" && perm.approved.includes(platform));

export const STAFF_NO_PUBLISH = "Publishing isn't turned on for your account. Ask the account owner.";
export const STAFF_NO_EMAIL = "Sending emails isn't turned on for your account. Ask the account owner.";
export const STAFF_NO_AUTOSPARKS = "Approving AutoSparks isn't turned on for your account. Ask the account owner.";

/** One line per use of something not recorded elsewhere (Spark Tools). Never throws. */
export async function logActivity(userId: string, kind: string, detail?: Record<string, unknown>): Promise<void> {
  try {
    await createAdminClient().from("activity_log").insert({ user_id: userId, kind, ...(detail && { detail }) });
  } catch { /* the tool still works */ }
}
