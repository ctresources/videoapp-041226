import { NextResponse } from "next/server";
import { ALL_SCOPES } from "@/lib/agent/types";

/**
 * OAuth protected-resource metadata for the MCP server (RFC 9728). AI
 * clients read this after a 401 from /api/mcp to find where to sign in:
 * SparkReels' Supabase project, acting as the OAuth 2.1 server.
 */
export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sparkreels.ai";

export function GET() {
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return NextResponse.json({
    resource: `${SITE}/api/mcp`,
    authorization_servers: [`${supabase}/auth/v1`],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "SparkReels",
    resource_documentation: `${SITE}/how-it-works`,
  });
}
