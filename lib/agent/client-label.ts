/**
 * Friendly names for AI clients, for Settings → Connections and the consent
 * page. Pure, so both the server and the browser can use it.
 */
export function clientLabel(c: Record<string, unknown>): string {
  const raw = String(c.client_name ?? c.name ?? c.client_id ?? "AI client");
  if (/chatgpt|openai/i.test(raw)) return "ChatGPT";
  if (/claude|anthropic/i.test(raw)) return "Claude";
  // Both connect remote MCP servers over Streamable HTTP (2026-11-22, the owner's ask).
  if (/gemini|google/i.test(raw)) return "Gemini";
  if (/grok|xai|x\.ai/i.test(raw)) return "Grok";
  // Muse (platform.muse.ai) lists approved connectors in its Settings > Connectors.
  if (/\bmuse\b/i.test(raw)) return "Muse";
  return raw.slice(0, 60);
}
