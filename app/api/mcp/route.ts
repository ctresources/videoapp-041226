import { NextRequest, NextResponse } from "next/server";
import { resolveActor } from "@/lib/agent/auth";
import { supabaseOAuthProvider } from "@/lib/agent/auth/supabase-oauth";
import { personalKeyProvider } from "@/lib/agent/auth/personal-key";
import { handleMcpMessage } from "@/lib/agent/mcp";

/**
 * POST /api/mcp — SparkReels' MCP server (Streamable HTTP, stateless JSON).
 *
 * An entry point only: it identifies the caller (Supabase OAuth 2.1 token,
 * or a personal access key), then hands each message to the shared agent
 * layer (lib/agent). Every rule lives there or in the services it reuses.
 *
 * Without a valid credential it answers 401 with the protected-resource
 * metadata address, which is how MCP clients discover where to sign in.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sparkreels.ai";

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Sign in to SparkReels to connect." } },
    {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource"` },
    },
  );
}

export async function POST(req: NextRequest) {
  const actor = await resolveActor(req, [personalKeyProvider, supabaseOAuthProvider]);
  if (!actor) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  // A batch is answered as a batch; notifications get no reply.
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleMcpMessage(actor, m)))).filter((r) => r !== null);
    return replies.length ? NextResponse.json(replies) : new NextResponse(null, { status: 202 });
  }
  const reply = await handleMcpMessage(actor, body as never);
  return reply === null ? new NextResponse(null, { status: 202 }) : NextResponse.json(reply);
}

/** No server-sent stream in this stateless server. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
