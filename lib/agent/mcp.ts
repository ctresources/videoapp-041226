import { runAgent } from "@/lib/agent";
import { TOOLS } from "@/lib/agent/tools";
import type { AgentActor, AgentResult } from "@/lib/agent/types";

/**
 * The MCP adapter's translation layer (JSON-RPC 2.0 over Streamable HTTP,
 * stateless). It only maps MCP messages to runAgent and back: it never picks
 * tools for a goal or holds any business logic.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

const INSTRUCTIONS = [
  "SparkReels makes real estate videos, blogs and social posts in the agent's own voice.",
  "Always start with plan_spark for any goal, show the plan, and wait for the user to Approve, Edit or Cancel.",
  "After approve_plan, run the creation steps in order with planId and step.",
  "Posting is two steps: publish_video or schedule_video prepares it; call confirm_publish only after the user confirms the exact video, destinations, date, time and time zone.",
].join(" ");

interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function asToolResult(r: AgentResult) {
  return {
    content: [{ type: "text", text: r.message + (r.data !== undefined ? `\n\n${JSON.stringify(r.data, null, 2)}` : "") }],
    structuredContent: { status: r.status, message: r.message, code: r.code, planId: r.planId, actionId: r.actionId, data: r.data },
    isError: r.status === "error" || r.status === "denied",
  };
}

/** Handles one JSON-RPC message. Returns null for notifications (no reply). */
export async function handleMcpMessage(actor: AgentActor, msg: RpcRequest): Promise<unknown | null> {
  const isNotification = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "SparkReels", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, {
        tools: TOOLS
          .filter((t) => actor.scopes.includes(t.scope))
          .map((t) => ({ name: t.name, description: t.description, inputSchema: t.input })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      const r = await runAgent({ actor, tool: name, input: args });
      return rpcResult(msg.id, asToolResult(r));
    }
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
