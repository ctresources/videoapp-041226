import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// Lightweight STT — no DB row, just returns the transcript.
// Used for inline voice-to-text inputs (e.g. topic field on Create page).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "No audio file" }, { status: 400 });

  const sttForm = new FormData();
  sttForm.append("audio", file, file.name || "recording.webm");
  sttForm.append("model_id", "scribe_v1");
  sttForm.append("language_code", "en");
  sttForm.append("timestamps_granularity", "none");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: sttForm,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "STT failed");
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await res.json();
  const transcript: string = data.text || data.transcript || "";
  return NextResponse.json({ transcript });
}
