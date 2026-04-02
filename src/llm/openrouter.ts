import { getSecret } from "../secrets/secrets.ts";
import type {
  LLMGateway,
  CompletionRequest,
  CompletionResponse,
  Message,
} from "./types.ts";
import type { CacheSegment } from "@veeclaw/shared";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

function isAnthropicModel(model: string): boolean {
  return model.includes("anthropic/") || model.includes("claude");
}

function buildMessages(
  req: CompletionRequest,
  cacheEnabled: boolean,
): Record<string, unknown>[] {
  const msgs: Record<string, unknown>[] = [];
  if (req.system) {
    if (Array.isArray(req.system)) {
      // Multi-segment system
      const segments = req.system as CacheSegment[];
      if (cacheEnabled) {
        msgs.push({
          role: "system",
          content: segments.map((seg) => {
            const block: Record<string, unknown> = { type: "text", text: seg.text };
            if (seg.cache_control) block.cache_control = seg.cache_control;
            return block;
          }),
        });
      } else {
        msgs.push({
          role: "system",
          content: segments.map((s) => s.text).join("\n\n"),
        });
      }
    } else if (cacheEnabled) {
      msgs.push({
        role: "system",
        content: [
          { type: "text", text: req.system, cache_control: { type: "ephemeral" } },
        ],
      });
    } else {
      msgs.push({ role: "system", content: req.system });
    }
  }
  for (const msg of req.messages) {
    msgs.push({ role: msg.role, content: msg.content });
  }
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
      const cacheEnabled = isAnthropicModel(model);

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
          messages: buildMessages(req, cacheEnabled),
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
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          cache_creation_input_tokens?: number;
          cache_read_input_tokens?: number;
        };
      };
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content ?? "",
        model: data.model ?? model,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
              cache_creation_input_tokens: data.usage.cache_creation_input_tokens,
              cache_read_input_tokens: data.usage.cache_read_input_tokens,
            }
          : undefined,
      };
    },

    async *stream(req: CompletionRequest): AsyncIterable<string> {
      const apiKey = getApiKey();
      const model = req.model ?? DEFAULT_MODEL;
      const cacheEnabled = isAnthropicModel(model);

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
          messages: buildMessages(req, cacheEnabled),
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
