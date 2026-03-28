import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@scaf/shared";

interface Env {
  OPENROUTER_API_KEY: string;
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

function buildMessages(req: CompletionRequest): Message[] {
  const msgs: Message[] = [];
  if (req.system) {
    msgs.push({ role: "system", content: req.system });
  }
  msgs.push(...req.messages);
  return msgs;
}

async function handleComplete(
  req: CompletionRequest,
  env: Env
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/scaf",
      "X-Title": "SCAF",
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(req),
      plugins: [{ id: "web" }],
      stream: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";

  const result: CompletionResponse = {
    content,
    model: data.model ?? model,
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

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/scaf",
      "X-Title": "SCAF",
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(req),
      plugins: [{ id: "web" }],
      stream: true,
    }),
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
