import type { AgentActor } from "@/lib/agent/types";

/**
 * How a request proves who it is. Modular on purpose: the Supabase OAuth 2.1
 * server is in beta, so the tools only ever see an AgentActor. Swapping the
 * OAuth server changes files in lib/agent/auth/ and nothing else.
 */
export interface AuthProvider {
  /** Returns the actor, or null when this provider doesn't apply / the credential is bad. */
  resolve(req: Request): Promise<AgentActor | null>;
}

/** The bearer credential on a request, if any. */
export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** Tries each provider in order; the first that recognizes the credential wins. */
export async function resolveActor(req: Request, providers: AuthProvider[]): Promise<AgentActor | null> {
  for (const p of providers) {
    const actor = await p.resolve(req);
    if (actor) return actor;
  }
  return null;
}
