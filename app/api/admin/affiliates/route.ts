import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { notifyAffiliateApproved } from "@/lib/email";

type Admin = ReturnType<typeof createAdminClient>;

/** Verifies the caller is an admin; returns the admin client or an error response. */
async function requireAdmin(): Promise<{ admin: Admin } | { error: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if ((profile as { role: string } | null)?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { admin };
}

/** Unique 6-char referral code, e.g. "SPARK-A1B2C3" style (uppercase base36). */
async function generateRefCode(admin: Admin): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data } = await admin.from("affiliates").select("id").eq("ref_code", code).maybeSingle();
    if (!data) return code;
  }
  // Extremely unlikely fallback — longer code.
  return (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).toUpperCase();
}

// GET /api/admin/affiliates — list all applications + summary counts
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { data: affiliates } = await admin
    .from("affiliates")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = affiliates ?? [];
  const counts = {
    pending: rows.filter((a) => a.status === "pending").length,
    approved: rows.filter((a) => a.status === "approved").length,
    rejected: rows.filter((a) => a.status === "rejected").length,
  };
  return NextResponse.json({ affiliates: rows, counts });
}

// PATCH /api/admin/affiliates — approve / reject / edit an affiliate
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const body = (await req.json()) as {
    affiliateId?: string;
    status?: "pending" | "approved" | "rejected";
    rejectionReason?: string;
    commissionRate?: number;
    commissionDurationMonths?: number;
  };
  if (!body.affiliateId) {
    return NextResponse.json({ error: "affiliateId required" }, { status: 400 });
  }

  const { data: affiliate } = await admin
    .from("affiliates")
    .select("*")
    .eq("id", body.affiliateId)
    .single();
  if (!affiliate) return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { updated_at: new Date().toISOString() };

  if (typeof body.commissionRate === "number") update.commission_rate = body.commissionRate;
  if (typeof body.commissionDurationMonths === "number") update.commission_duration_months = body.commissionDurationMonths;

  let newlyApproved = false;
  if (body.status && body.status !== affiliate.status) {
    update.status = body.status;
    update.reviewed_at = new Date().toISOString();
    if (body.status === "rejected") update.rejection_reason = body.rejectionReason || null;
    if (body.status === "approved") {
      newlyApproved = true;
      // Issue a ref_code on first approval if one doesn't exist yet.
      if (!affiliate.ref_code) update.ref_code = await generateRefCode(admin);
    }
  }

  const { data: updated, error } = await admin
    .from("affiliates")
    .update(update)
    .eq("id", body.affiliateId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (newlyApproved && updated?.ref_code) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sparkreels.ai";
    notifyAffiliateApproved({
      name: updated.full_name,
      email: updated.email,
      refCode: updated.ref_code,
      appUrl,
    });
  }

  return NextResponse.json({ affiliate: updated });
}
