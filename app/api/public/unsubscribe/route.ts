import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

/**
 * "Stop these reminders" in the free-account follow-up emails (2026-10-23).
 * GET (the link in the email) only shows a button: mail scanners such as
 * Outlook's open every link, so a GET that unsubscribed would sign people
 * out of emails they never refused. POST does it: that button, and the
 * one-click unsubscribe mail apps send from the List-Unsubscribe header.
 */
const TOKEN = /^[0-9a-f-]{36}$/i;

async function optOut(token: string): Promise<boolean> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ followup_opt_out_at: new Date().toISOString() })
    .eq("followup_token", token)
    .is("followup_opt_out_at", null);
  const { data } = await admin.from("profiles").select("id").eq("followup_token", token).maybeSingle();
  return !!data;
}

function page(inner: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SparkReels</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:48px 16px">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:18px;font-weight:bold">SparkReels</p>
${inner}
</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

const BAD_LINK = `<p style="margin:0 0 20px;line-height:1.6">That link didn't work. Reply to any SparkReels email and we'll take you off the list.</p>`;

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  if (!TOKEN.test(t)) return page(BAD_LINK, 400);
  return page(`
<p style="margin:0 0 20px;line-height:1.6">Stop getting reminder emails about your free video?</p>
<form method="post" action="/api/public/unsubscribe?t=${t}">
<button type="submit" style="background:#1e3a8a;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-weight:bold;font-size:15px;cursor:pointer">Stop reminders</button>
</form>`);
}

export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const ok = TOKEN.test(t) && (await optOut(t));
  if (!ok) return page(BAD_LINK, 400);
  return page(`
<p style="margin:0 0 20px;line-height:1.6">You're unsubscribed. You won't get any more reminder emails from SparkReels.</p>
<a href="https://www.sparkreels.ai" style="color:#1e3a8a;font-weight:bold">Go to SparkReels</a>`);
}
