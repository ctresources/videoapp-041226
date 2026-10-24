import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAdminReply, emailConfigured } from "@/lib/email";
import { EMAIL_CATALOG, fillSubject, planName, previewCatalogEmail, renderReply } from "@/lib/admin-emails";

export const dynamic = "force-dynamic";

/**
 * Admin → Emails (2026-10-24, the owner's mockup).
 *
 * GET  — GoHighLevel requests (with each person's plan), saved replies, and
 *        the list of emails SparkReels sends. ?preview=<key> returns one of
 *        those emails exactly as sent, built with a sample name and never sent.
 * POST — { action, … }: add_request, mark_sent, send_request, save_reply,
 *        delete_reply, preview_reply.
 */
async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return (profile as { role: string } | null)?.role === "admin" ? user : null;
}

interface RequestRow {
  id: string; user_id: string | null; name: string | null; email: string; requested_at: string;
  status: "waiting" | "sent"; sent_at: string | null; sent_how: string | null; sent_subject: string | null; sent_html: string | null;
}
interface ReplyRow { id: string; slug: string | null; name: string; subject: string; body: string; updated_at: string }

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();

  // The user picker under Add request (2026-10-24): accounts whose name or
  // email has the typed text in it.
  const q = req.nextUrl.searchParams.get("users");
  if (q !== null) {
    const term = q.trim().replace(/[%_,()]/g, " ").slice(0, 80);
    if (term.length < 2) return NextResponse.json({ users: [] });
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, subscription_tier")
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    return NextResponse.json({
      users: ((data ?? []) as { id: string; full_name: string | null; email: string; subscription_tier: string | null }[])
        .map((u) => ({ id: u.id, name: u.full_name, email: u.email, plan: planName(u.subscription_tier) })),
    });
  }

  // Every user as an Outlook contacts file (2026-10-24, the owner's ask):
  // Outlook's own CSV columns, filed under the category "SparkReels User".
  if (req.nextUrl.searchParams.get("contacts") === "outlook") {
    const { data } = await admin
      .from("profiles")
      .select("full_name, email, phone, company_name, subscription_tier, created_at")
      .not("email", "is", null)
      .order("created_at");
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = ((data ?? []) as { full_name: string | null; email: string; phone: string | null; company_name: string | null; subscription_tier: string | null; created_at: string }[])
      .map((u) => {
        const parts = (u.full_name ?? "").trim().split(/\s+/).filter(Boolean);
        const first = parts[0] ?? "";
        const last = parts.slice(1).join(" ");
        const joined = new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        return [first, last, u.email, u.phone ?? "", u.company_name ?? "", "SparkReels User",
          `SparkReels ${planName(u.subscription_tier)} plan. Joined ${joined}.`].map(cell).join(",");
      });
    const csv = ["First Name,Last Name,E-mail Address,Mobile Phone,Company,Categories,Notes", ...rows].join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sparkreels-users-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const key = req.nextUrl.searchParams.get("preview");
  if (key) {
    if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up on this server, so there is nothing to preview." }, { status: 503 });
    const email = await previewCatalogEmail(key);
    if (!email) return NextResponse.json({ error: "That email couldn't be built." }, { status: 404 });
    return NextResponse.json({ email });
  }

  const [{ data: reqs }, { data: replies }] = await Promise.all([
    admin.from("ghl_workflow_requests").select("*").order("requested_at", { ascending: false }).limit(200),
    admin.from("email_replies").select("id, slug, name, subject, body, updated_at").order("created_at"),
  ]);
  const requests = (reqs ?? []) as RequestRow[];

  // Each person's plan, by account or, for one added by hand, by email.
  const ids = requests.map((r) => r.user_id).filter((x): x is string => !!x);
  const emails = requests.filter((r) => !r.user_id).map((r) => r.email.toLowerCase());
  const [{ data: byId }, { data: byEmail }] = await Promise.all([
    ids.length ? admin.from("profiles").select("id, email, subscription_tier").in("id", ids) : Promise.resolve({ data: [] }),
    emails.length ? admin.from("profiles").select("id, email, subscription_tier").in("email", emails) : Promise.resolve({ data: [] }),
  ]);
  const profs = [...((byId ?? []) as { id: string; email: string | null; subscription_tier: string | null }[]),
    ...((byEmail ?? []) as { id: string; email: string | null; subscription_tier: string | null }[])];
  const tierOf = (r: RequestRow) => {
    const p = profs.find((x) => (r.user_id ? x.id === r.user_id : x.email?.toLowerCase() === r.email.toLowerCase()));
    return p ? planName(p.subscription_tier) : null;
  };

  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, plan: tierOf(r) })),
    replies: (replies ?? []) as ReplyRow[],
    catalog: EMAIL_CATALOG.map(({ key: k, name, goesTo, when }) => ({ key: k, name, goesTo, when })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown, max = 20000) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  switch (body.action) {
    case "add_request": {
      const email = str(body.email, 320).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
      const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
      const { error } = await admin.from("ghl_workflow_requests").insert({
        email, name: str(body.name, 200) || null, user_id: (prof as { id: string } | null)?.id ?? null,
      });
      if (error) return NextResponse.json({ error: "Couldn't add it. Try again." }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "mark_sent": {
      const { error } = await admin.from("ghl_workflow_requests")
        .update({ status: "sent", sent_at: new Date().toISOString(), sent_how: "marked" })
        .eq("id", str(body.id, 64));
      if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "send_request": {
      const { data: r } = await admin.from("ghl_workflow_requests").select("*").eq("id", str(body.id, 64)).single();
      const row = r as RequestRow | null;
      if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      const replyQuery = body.replyId
        ? admin.from("email_replies").select("*").eq("id", str(body.replyId, 64))
        : admin.from("email_replies").select("*").eq("slug", "ghl-workflow");
      const { data: rep } = await replyQuery.single();
      const reply = rep as ReplyRow | null;
      if (!reply) return NextResponse.json({ error: "The GoHighLevel reply is missing. Add it in Saved replies." }, { status: 404 });

      const subject = fillSubject(reply.subject, row.name);
      const { html, text } = renderReply(reply.body, row.name);
      const ok = await sendAdminReply({ to: row.email, subject, html, text });
      if (!ok) return NextResponse.json({ error: "It didn't send. Try again in a minute." }, { status: 502 });
      await admin.from("ghl_workflow_requests").update({
        status: "sent", sent_at: new Date().toISOString(), sent_how: "sparkreels", sent_subject: subject, sent_html: html,
      }).eq("id", row.id);
      return NextResponse.json({ ok: true });
    }

    case "save_reply": {
      const name = str(body.name, 120);
      const subject = str(body.subject, 300);
      const text = str(body.body);
      if (!name || !subject || !text) return NextResponse.json({ error: "Name, subject and message are all needed." }, { status: 400 });
      const id = str(body.id, 64);
      const { data, error } = id
        ? await admin.from("email_replies").update({ name, subject, body: text, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
        : await admin.from("email_replies").insert({ name, subject, body: text }).select("id").single();
      if (error || !data) return NextResponse.json({ error: "Couldn't save it. Try again." }, { status: 500 });
      return NextResponse.json({ id: (data as { id: string }).id });
    }

    case "delete_reply": {
      const id = str(body.id, 64);
      const { data: rep } = await admin.from("email_replies").select("slug").eq("id", id).single();
      if ((rep as { slug: string | null } | null)?.slug) return NextResponse.json({ error: "The GoHighLevel reply is used by Send workflow, so it stays." }, { status: 400 });
      await admin.from("email_replies").delete().eq("id", id);
      return NextResponse.json({ ok: true });
    }

    case "preview_reply": {
      const name = str(body.firstName, 100) || "Jane";
      const { html, text } = renderReply(str(body.body), name);
      return NextResponse.json({
        email: { from: "SparkReels <support@sparkreels.ai>", reply_to: "support@sparkreels.ai", subject: fillSubject(str(body.subject, 300), name), html, text },
      });
    }
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
