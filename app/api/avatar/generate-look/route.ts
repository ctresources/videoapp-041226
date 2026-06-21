import { createClient } from "@/lib/supabase/server";
import { generateAvatarLook } from "@/lib/api/heygen";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/avatar/generate-look
 * Body: { avatarId: string, prompt: string, name?: string }
 *
 * Generates a new look for an existing avatar using the Tokyo prompt pipeline.
 * The avatarId is used as the visual reference — character identity stays consistent.
 * The new look is saved to the same group and will appear in /api/avatar/looks.
 * Cost: $1.00 per generated look.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const avatarId = body.avatarId as string | undefined;
  const prompt = body.prompt as string | undefined;
  const name = (body.name as string | undefined) || `New Look ${new Date().toLocaleDateString()}`;

  if (!avatarId) return NextResponse.json({ error: "avatarId required" }, { status: 400 });
  if (!prompt || prompt.trim().length < 10) {
    return NextResponse.json({ error: "prompt must be at least 10 characters" }, { status: 400 });
  }

  try {
    const look = await generateAvatarLook(avatarId, prompt.trim(), name);
    return NextResponse.json({ look });
  } catch (err) {
    console.error("[generate-look] POST error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Look generation failed" },
      { status: 422 },
    );
  }
}
