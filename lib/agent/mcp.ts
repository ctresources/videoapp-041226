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
  "A person may have more than one SparkReels account. Every plan starts with the account's name and email: tell the user which account it is, and if it isn't the one they want, stop before making anything.",
  "Always start with plan_spark for any goal, passing the user's words as they said them. If it returns questions, ask the user exactly those and never answer for them.",
  "Show the plan and wait for the user to Approve, Edit or Cancel.",
  "Never add images or photos from the web to a SparkReels plan: show only the picture SparkReels returns, if any. SparkReels chooses the video's visuals.",
  "After approve_plan, run the creation steps in order with planId and step.",
  "Posting is two steps: publish_video or schedule_video prepares it; call confirm_publish only after the user confirms the exact video, destinations, date, time and time zone.",
].join(" ");

interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }

const rpcResult = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** A plan's picture, sent as an image so the AI app shows it rather than finding its own. */
async function pictureContent(r: AgentResult) {
  const url = (r.data as { picture?: { url?: string } } | undefined)?.picture?.url;
  if (!url) return [];
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!res.ok || !mimeType.startsWith("image/")) return [];
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > 1_500_000) return [];
    return [{ type: "image", data: bytes.toString("base64"), mimeType }];
  } catch {
    return [];
  }
}

async function asToolResult(r: AgentResult) {
  return {
    content: [
      { type: "text", text: r.message + (r.data !== undefined ? `\n\n${JSON.stringify(r.data, null, 2)}` : "") },
      ...(await pictureContent(r)),
    ],
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
      return rpcResult(msg.id, await asToolResult(r));
    }
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
