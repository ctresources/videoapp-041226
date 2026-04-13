import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAccounts, validateApiKey } from "@/lib/api/blotato";
import { NextRequest, NextResponse } from "next/server";

// GET - list connected social accounts from Blotato
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("blotato_api_key")
    .eq("id", user.id)
    .single();

  const apiKey = (profile as { blotato_api_key: string | null } | null)?.blotato_api_key;
  if (!apiKey) return NextResponse.json({ accounts: [], connected: false });

  try {
    const accounts = await listAccounts(apiKey);
    return NextResponse.json({ accounts, connected: true });
  } catch {
    return NextResponse.json({ accounts: [], connected: false });
  }
}

// POST - save / validate Blotato API key
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiKey } = await req.json();
  if (!apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  const valid = await validateApiKey(apiKey);
  if (!valid) return NextResponse.json({ error: "Invalid Blotato API key" }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("profiles").update({ blotato_api_key: apiKey }).eq("id", user.id);

  // Fetch and return connected accounts immediately
  const accounts = await listAccounts(apiKey);
  return NextResponse.json({ success: true, accounts });
}

// DELETE - remove Blotato API key
export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  await admin.from("profiles").update({ blotato_api_key: null }).eq("id", user.id);
  return NextResponse.json({ success: true });
}
