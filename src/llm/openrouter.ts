import { getSecret } from "../secrets/secrets.ts";
import type {
  LLMGateway,
  CompletionRequest,
  CompletionResponse,
  Message,
} from "./types.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

function buildMessages(req: CompletionRequest): Message[] {
  const msgs: Message[] = [];
  if (req.system) {
    msgs.push({ role: "system", content: req.system });
  }
  msgs.push(...req.messages);
  return msgs;
}

function getApiKey(): string {
  const key = getSecret("openrouter_api_key");
  if (!key) {
    throw new Error(
      "OpenRouter API key not configured. Run veeclaw to set it up."
    );
  }
  return key;
}

export function createOpenRouterGateway(): LLMGateway {
  return {
    async complete(req: CompletionRequest): Promise<CompletionResponse> {
      const apiKey = getApiKey();
      const model = req.model ?? DEFAULT_MODEL;

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/vboctor/veeclaw",
          "X-Title": "VeeClaw",
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(req),
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content ?? "",
        model: data.model ?? model,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
            }
          : undefined,
      };
    },

    async *stream(req: CompletionRequest): AsyncIterable<string> {
      const apiKey = getApiKey();
      const model = req.model ?? DEFAULT_MODEL;

      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/vboctor/veeclaw",
          "X-Title": "VeeClaw",
        },
        body: JSON.stringify({
          model,
          messages: buildMessages(req),
          stream: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${text}`);
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
