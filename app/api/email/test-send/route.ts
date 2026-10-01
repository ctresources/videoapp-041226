import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** How many test emails one account may send itself in a day. */
const DAILY_LIMIT = 10;
const ENDPOINT = "email_test_send";

/**
 * POST /api/email/test-send — { subject, html, text }
 *
 * Sends the Share Kit's email version to the signed-in agent's own address,
 * so they see it in a real inbox before pasting it into their email tool.
 * Only ever to themselves: the recipient is the session's email, never the
 * request's, so this cannot be pointed at anyone else. Capped per day
 * because it spends SparkReels' own sending reputation.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Email sending isn't set up." }, { status: 503 });

  const { subject, html, text } = (await req.json()) as { subject?: string; html?: string; text?: string };
  if (!subject?.trim() || !html?.trim()) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  if (html.length > 200_000) return NextResponse.json({ error: "That email is too large to send." }, { status: 413 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("api_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("endpoint", ENDPOINT)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: `That's ${DAILY_LIMIT} test emails today. Try again tomorrow.` }, { status: 429 });
  }

  const from = process.env.NOTIFY_FROM_EMAIL || "SparkReels <noreply@sparkreels.ai>";

  /*
   * Said at the top, in the test only. A marketing-looking email from a
   * no-reply address is what Yahoo-run inboxes (Verizon, AOL) file as spam;
   * saying plainly that this is a preview, and letting a reply go back to the
   * agent, makes it read as the message to themselves that it is. The copy
   * they paste is untouched.
   */
  const note = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:12px 8px 0;font-family:Arial, Helvetica, sans-serif;font-size:13px;line-height:1.5;color:#64748b;">Test from SparkReels. This is how your email will look. Paste it into your email tool to send it.</td></tr></table>`;
  const testHtml = /<body[^>]*>/i.test(html) ? html.replace(/(<body[^>]*>)/i, `$1${note}`) : note + html;
  const testText = text?.trim()
    ? `Test from SparkReels. This is how your email will look. Paste it into your email tool to send it.\n\n${text}`
    : "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: user.email,
      reply_to: user.email,
      subject: `[Test] ${subject.trim().slice(0, 150)}`,
      html: testHtml,
      ...(testText ? { text: testText } : {}),
    }),
  });
  if (!res.ok) {
    console.error("[test-send] Resend error:", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ error: "Couldn't send the test email." }, { status: 502 });
  }

  await admin.from("api_usage_log").insert({
    user_id: user.id, api_provider: "resend", endpoint: ENDPOINT, credits_used: 0, response_status: 200,
  });
  return NextResponse.json({ ok: true, to: user.email });
}
