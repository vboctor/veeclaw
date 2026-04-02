import type {
  CacheSegment,
  CompletionRequest,
  CompletionResponse,
  Message,
  ToolCall,
} from "@veeclaw/shared";

interface Env {
  OPENROUTER_API_KEY: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

function isAnthropicModel(model: string): boolean {
  return model.includes("anthropic/") || model.includes("claude");
}

function buildSystemContent(
  system: string | CacheSegment[],
  cacheEnabled: boolean,
): string | Record<string, unknown>[] {
  if (typeof system === "string") {
    // Legacy: single string — wrap with one cache breakpoint
    return cacheEnabled
      ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }]
      : system;
  }

  // Multi-segment: each segment becomes its own content block
  if (!cacheEnabled) {
    return system.map((s) => s.text).join("\n\n");
  }

  return system.map((seg) => {
    const block: Record<string, unknown> = { type: "text", text: seg.text };
    if (seg.cache_control) block.cache_control = seg.cache_control;
    return block;
  });
}

function buildMessages(
  req: CompletionRequest,
  cacheEnabled: boolean,
): Record<string, unknown>[] {
  const msgs: Record<string, unknown>[] = [];
  if (req.system) {
    msgs.push({
      role: "system",
      content: buildSystemContent(req.system, cacheEnabled),
    });
  }
  for (const msg of req.messages) {
    const m: Record<string, unknown> = { role: msg.role, content: msg.content };
    if (msg.tool_calls) m.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
    msgs.push(m);
  }
  return msgs;
}

/**
 * Mark the last tool with cache_control so the full tool set is cached.
 * Anthropic caches everything up to and including the cache breakpoint.
 */
function buildTools(
  tools: unknown[],
  cacheEnabled: boolean,
): unknown[] {
  if (!cacheEnabled || tools.length === 0) return tools;

  const result = [...tools];
  const last = { ...(result[result.length - 1] as Record<string, unknown>) };
  last.cache_control = { type: "ephemeral" };
  result[result.length - 1] = last;
  return result;
}

async function handleComplete(
  req: CompletionRequest,
  env: Env
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;
  const cacheEnabled = isAnthropicModel(model);

  const payload: Record<string, unknown> = {
    model,
    messages: buildMessages(req, cacheEnabled),
    stream: false,
  };

  if (req.plugins?.length) {
    payload.plugins = req.plugins.map((id) => ({ id }));
  }

  if (req.tools?.length) {
    payload.tools = buildTools(req.tools, cacheEnabled);
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/veeclaw",
      "X-Title": "VeeClaw",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[];
    model?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";
  const tool_calls = choice?.message?.tool_calls;

  const result: CompletionResponse = {
    content,
    model: data.model ?? model,
    tool_calls: tool_calls?.length ? tool_calls : undefined,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          cache_creation_input_tokens: data.usage.cache_creation_input_tokens,
          cache_read_input_tokens: data.usage.cache_read_input_tokens,
        }
      : undefined,
  };

  return Response.json(result);
}

async function handleStream(
  req: CompletionRequest,
  env: Env
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;
  const cacheEnabled = isAnthropicModel(model);

  const payload: Record<string, unknown> = {
    model,
    messages: buildMessages(req, cacheEnabled),
    stream: true,
  };

  if (req.plugins?.length) {
    payload.plugins = req.plugins.map((id) => ({ id }));
  }

  if (req.tools?.length) {
    payload.tools = buildTools(req.tools, cacheEnabled);
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/veeclaw",
      "X-Title": "VeeClaw",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body: CompletionRequest;

    try {
      body = (await request.json()) as CompletionRequest;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    switch (url.pathname) {
      case "/v1/complete":
        return handleComplete(body, env);
      case "/v1/stream":
        return handleStream(body, env);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
