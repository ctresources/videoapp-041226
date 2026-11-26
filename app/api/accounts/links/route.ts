import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  browserProof, describeAccount, finishLink, LINK_CODE_MINUTES, LINK_COOKIE, linkCodeOwner, linkedAccounts, startLink, unlink, WRONG_BROWSER,
} from "@/lib/accounts/links";
import { sendAccountsLinkedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Linked accounts (2026-11-25, the owner's approved mockup:
 * docs/mockups/switch-accounts.html).
 *
 *   GET                              this account and the ones linked to it
 *   POST { action: "start" }         a one-time link page address (15 minutes)
 *   POST { action: "preview", code } who asked to link, and who is signed in now
 *   POST { action: "finish", code }  links the two (must be signed in to the other one)
 *   DELETE { otherId }               unlinks
 *
 * Preview and finish work only in the browser that pressed start (see
 * LINK_COOKIE), and both accounts get an email when a link is made.
 */
async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

const sameBrowser = (req: NextRequest, code: string) => req.cookies.get(LINK_COOKIE)?.value === browserProof(code);

export async function GET() {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const [me, accounts] = await Promise.all([describeAccount(admin, user.id), linkedAccounts(admin, user.id)]);
  return NextResponse.json({ me, accounts });
}

export async function POST(req: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; code?: string };
  const admin = createAdminClient();
  const code = String(b.code ?? "").slice(0, 100);

  if (b.action === "start") {
    const c = await startLink(admin, user.id);
    const res = NextResponse.json({ url: `/link-account?code=${encodeURIComponent(c)}` });
    res.cookies.set(LINK_COOKIE, browserProof(c), {
      httpOnly: true, secure: true, sameSite: "lax", path: "/api/accounts", maxAge: LINK_CODE_MINUTES * 60,
    });
    return res;
  }
  if (b.action === "preview") {
    const owner = code ? await linkCodeOwner(admin, code) : null;
    if (!owner) return NextResponse.json({ error: "This link has expired. Press Link another account again." }, { status: 410 });
    if (!sameBrowser(req, code)) return NextResponse.json({ error: WRONG_BROWSER }, { status: 403 });
    return NextResponse.json({ owner, me: await describeAccount(admin, user.id) });
  }
  if (b.action === "finish") {
    if (!code) return NextResponse.json({ error: "This link has expired. Press Link another account again." }, { status: 410 });
    if (!sameBrowser(req, code)) return NextResponse.json({ error: WRONG_BROWSER }, { status: 403 });
    const r = await finishLink(admin, code, user.id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    const me = await describeAccount(admin, user.id);
    // Both accounts hear about it, so a link nobody meant to make is undone.
    waitUntil(Promise.all([
      me.email && r.other.email ? sendAccountsLinkedEmail({ email: me.email, name: me.name, otherEmail: r.other.email }) : null,
      me.email && r.other.email ? sendAccountsLinkedEmail({ email: r.other.email, name: r.other.name, otherEmail: me.email }) : null,
    ]).catch(() => null));
    const res = NextResponse.json({ ok: true, other: r.other });
    res.cookies.delete({ name: LINK_COOKIE, path: "/api/accounts" });
    return res;
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { otherId } = (await req.json().catch(() => ({}))) as { otherId?: string };
  if (!otherId || !/^[0-9a-f-]{36}$/i.test(otherId)) return NextResponse.json({ error: "otherId required" }, { status: 400 });
  const ok = await unlink(createAdminClient(), user.id, otherId);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not linked" }, { status: 404 });
}
