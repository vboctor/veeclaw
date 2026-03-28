import type {
  CompletionRequest,
  CompletionResponse,
  Message,
  ToolCall,
} from "@scaf/shared";

interface Env {
  OPENROUTER_API_KEY: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

function buildMessages(req: CompletionRequest): Record<string, unknown>[] {
  const msgs: Record<string, unknown>[] = [];
  if (req.system) {
    msgs.push({ role: "system", content: req.system });
  }
  for (const msg of req.messages) {
    const m: Record<string, unknown> = { role: msg.role, content: msg.content };
    if (msg.tool_calls) m.tool_calls = msg.tool_calls;
    if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
    msgs.push(m);
  }
  return msgs;
}

async function handleComplete(
  req: CompletionRequest,
  env: Env
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;

  const payload: Record<string, unknown> = {
    model,
    messages: buildMessages(req),
    plugins: [{ id: "web" }],
    stream: false,
  };

  if (req.tools?.length) {
    payload.tools = req.tools;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/scaf",
      "X-Title": "SCAF",
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
    usage?: { prompt_tokens: number; completion_tokens: number };
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

  const payload: Record<string, unknown> = {
    model,
    messages: buildMessages(req),
    plugins: [{ id: "web" }],
    stream: true,
  };

  if (req.tools?.length) {
    payload.tools = req.tools;
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/scaf",
      "X-Title": "SCAF",
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
