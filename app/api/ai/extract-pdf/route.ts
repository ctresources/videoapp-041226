import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

export const maxDuration = 60;

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

  let text = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: extracted } = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(extracted) ? extracted.join(" ") : extracted)
      .replace(/\s{3,}/g, "  ")
      .trim();
  } catch (pdfErr) {
    console.error("PDF parse error:", pdfErr);
    return NextResponse.json(
      { error: "Could not read this PDF — it may be scanned/image-only or corrupted." },
      { status: 400 },
    );
  }

  if (!text || text.trim().length < 30) {
    return NextResponse.json(
      { error: "This PDF has no readable text (it may be scanned/image-only). Try a text-based PDF." },
      { status: 400 },
    );
  }

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
