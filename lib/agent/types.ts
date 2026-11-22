/**
 * Shared agent layer types (2026-11-22, plan revision 5,
 * docs/plans/mcp-connector-plan.md).
 *
 * Hard rule: existing app logic is reused, never copied. Tools call the
 * shared services in lib/ that the app's own routes call.
 */

export type Scope =
  | "account:read"
  | "sparks:plan"
  | "sparks:write"
  | "videos:create"
  | "videos:read"
  | "publish:write";

export const ALL_SCOPES: Scope[] = [
  "account:read", "sparks:plan", "sparks:write", "videos:create", "videos:read", "publish:write",
];

/** Plain words for Settings → Connections and consent screens. */
export const SCOPE_LABELS: Record<Scope, string> = {
  "account:read": "See your plan, videos left and connected accounts",
  "sparks:plan": "Plan Sparks (creates nothing)",
  "sparks:write": "Write scripts, blogs and social copy",
  "videos:create": "Make videos (uses your plan's videos)",
  "videos:read": "Check videos and drafts",
  "publish:write": "Ask to publish or schedule (you confirm each one)",
};

/** Where a call came from: the client or source, and which adapter carried it. */
export type Adapter = "mcp" | "in_app" | "hub" | "halo" | "boldtrail" | "ghl";

/** Who is calling, resolved by an AuthProvider before any tool runs. */
export interface AgentActor {
  userId: string;
  /** agent_connections row, when the call came through OAuth or a key. */
  connectionId: string | null;
  /** "ChatGPT", "Claude", "Sparklee in-app", a key's name… */
  source: string;
  adapter: Adapter;
  scopes: Scope[];
}

export type AgentStatus = "ok" | "needs_approval" | "needs_input" | "denied" | "error";

/** Every tool returns this. `message` is plain language a client can show. */
export interface AgentResult<T = unknown> {
  status: AgentStatus;
  message: string;
  data?: T;
  /** Machine-readable reason for denied / error / needs_input. */
  code?: string;
  planId?: string;
  actionId?: string;
}

export const ok = <T>(message: string, data?: T, extra: Partial<AgentResult<T>> = {}): AgentResult<T> =>
  ({ status: "ok", message, data, ...extra });
export const denied = (message: string, code: string): AgentResult => ({ status: "denied", message, code });
export const needsInput = (message: string, code: string, data?: unknown): AgentResult => ({ status: "needs_input", message, code, data });
export const failed = (message: string, code = "error"): AgentResult => ({ status: "error", message, code });
