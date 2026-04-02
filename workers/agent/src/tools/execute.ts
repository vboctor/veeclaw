import type { ToolCall, Message } from "@veeclaw/shared";

/**
 * Execute a tool call by routing it to the appropriate connector.
 * Returns the tool result as a string (JSON-serialized).
 */
async function executeToolCall(
  call: ToolCall,
  connectors: Record<string, Fetcher>,
  connectorMap: Record<string, string>,
  routes: Record<string, string>,
): Promise<string> {
  const route = routes[call.function.name];
  if (!route) {
    return JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
  }

  const connectorKey = connectorMap[call.function.name];
  const connector = connectorKey ? connectors[connectorKey] : undefined;
  if (!connector) {
    return JSON.stringify({
      error: `No connector bound for tool: ${call.function.name}`,
    });
  }

  try {
    const res = await connector.fetch(`https://internal${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: call.function.arguments,
    });

    const text = await res.text();

    // Truncate very large responses to avoid blowing up context
    const MAX_TOOL_RESPONSE_CHARS = 20_000;
    if (text.length > MAX_TOOL_RESPONSE_CHARS) {
      // For JSON arrays, truncate at item boundaries
      if (text.startsWith("[")) {
        const cutoff = text.lastIndexOf("},", MAX_TOOL_RESPONSE_CHARS);
        if (cutoff > 0) {
          return text.slice(0, cutoff + 1) + "\n]  // ... [truncated]";
        }
      }
      return text.slice(0, MAX_TOOL_RESPONSE_CHARS) + "\n... [truncated]";
    }

    return text;
  } catch (err) {
    return JSON.stringify({
      error: err instanceof Error ? err.message : "Tool execution failed",
    });
  }
}

/**
 * Execute all tool calls in parallel and return tool result messages.
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  connectors: Record<string, Fetcher>,
  connectorMap: Record<string, string>,
  routes: Record<string, string>,
): Promise<Message[]> {
  const results = await Promise.all(
    toolCalls.map(async (call) => {
      const result = await executeToolCall(
        call,
        connectors,
        connectorMap,
        routes,
      );
      return {
        role: "tool" as const,
        content: result,
        tool_call_id: call.id,
      };
    }),
  );
  return results;
}
