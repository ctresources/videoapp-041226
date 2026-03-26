import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// GET - list all connected social accounts for current user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("social_accounts")
    .select("id, platform, platform_username, avatar_url, is_active, token_expires_at, created_at")
    .eq("user_id", user.id)
    .order("created_at");

  return NextResponse.json({ accounts: data || [] });
}

// DELETE - disconnect a social account
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = await req.json();
  const admin = createAdminClient();

  const { error } = await admin
    .from("social_accounts")
    .delete()
    .eq("id", accountId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
