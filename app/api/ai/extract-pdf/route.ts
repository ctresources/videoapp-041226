import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const matches: string[] = [];
  const regex = /BT([\s\S]*?)ET/g;
  let m;
  while ((m = regex.exec(raw)) !== null) {
    const inside = m[1];
    const textRegex = /\((.*?)\)\s*Tj/g;
    let t;
    while ((t = textRegex.exec(inside)) !== null) {
      matches.push(t[1]);
    }
  }
  if (matches.length > 0) return matches.join(" ");
  return raw.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 20000);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF must be under 20MB" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = extractPdfText(buffer);

  const admin = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `pdf-attachments/${user.id}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await admin.storage
    .from("assets")
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("assets").getPublicUrl(path);

  return NextResponse.json({
    text: text.slice(0, 5000),
    url: publicUrl,
    name: file.name,
  });
}
