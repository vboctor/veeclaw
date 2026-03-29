import { getSecret } from "../secrets/secrets.ts";
import type {
  LLMGateway,
  CompletionRequest,
  CompletionResponse,
} from "./types.ts";

function getAgentUrl(): string {
  const url = getSecret("agent_url");
  if (!url) {
    throw new Error(
      "Agent URL not configured. Run scaf to set it up."
    );
  }
  return url.replace(/\/$/, "");
}

function getAgentToken(): string {
  const token = getSecret("agent_token");
  if (!token) {
    throw new Error(
      "Agent token not configured. Run scaf to set it up."
    );
  }
  return token;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  headers["Authorization"] = `Bearer ${getAgentToken()}`;
  return headers;
}

export function createWorkerGateway(): LLMGateway {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const url = getAgentUrl();

      const response = await fetch(`${url}/v1/complete`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Agent error (${response.status}): ${text}`);
      }

      return (await response.json()) as CompletionResponse;
    },

    async *stream(req: CompletionRequest): AsyncIterable<string> {
      const url = getAgentUrl();

      const response = await fetch(`${url}/v1/stream`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Agent error (${response.status}): ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") return;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Skip malformed SSE chunks
          }
        }
      }
    },
  };
}
