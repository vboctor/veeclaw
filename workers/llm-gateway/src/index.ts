import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@scaf/shared";
import { loadMemory, injectMemory } from "./memory/load.ts";
import { appendToWorkingMemory } from "./memory/update.ts";
import { extractFacts } from "./memory/extract.ts";
import { SchedulerClient } from "./schedule/scheduler-client.ts";
import { loadScheduleContext } from "./schedule/context.ts";
import {
  extractScheduleCommands,
  processScheduleCommands,
} from "./schedule/extract.ts";
import SYSTEM_PROMPT from "./prompts/system.md";

interface Env {
  OPENROUTER_API_KEY: string;
  GATEWAY_TOKEN?: string;
  MEMORY_KV: KVNamespace;
  SCHEDULER: Fetcher; // Service binding to scaf-scheduler
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

function applySystemPrompt(req: CompletionRequest): CompletionRequest {
  const now = new Date();
  const timeContext = `Current datetime: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${now.toLocaleTimeString("en-US", { hour12: true })})`;

  const base = `${SYSTEM_PROMPT}\n\n${timeContext}`;
  const system = req.system ? `${base}\n\n---\n\n${req.system}` : base;
  return { ...req, system };
}

function buildMessages(req: CompletionRequest): Message[] {
  const msgs: Message[] = [];
  if (req.system) {
    msgs.push({ role: "system", content: req.system });
  }
  msgs.push(...req.messages);
  return msgs;
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function authenticate(request: Request, env: Env): boolean {
  if (!env.GATEWAY_TOKEN) return true;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.GATEWAY_TOKEN}`;
}

function getLastUserMessage(req: CompletionRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === "user") return req.messages[i].content;
  }
  return "";
}

async function processMemoryInBackground(
  kv: KVNamespace,
  apiKey: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    await Promise.all([
      appendToWorkingMemory(kv, apiKey, userMessage, assistantResponse),
      extractFacts(kv, apiKey, userMessage, assistantResponse),
    ]);
  } catch {
    // Memory ops are best-effort — never break the primary flow
  }
}

async function handleComplete(
  req: CompletionRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;
  const userMessage = getLastUserMessage(req);
  const withPrompt = applySystemPrompt(req);
  const scheduler = new SchedulerClient(env.SCHEDULER);

  const memory = await loadMemory(env.MEMORY_KV);
  let scheduleContext: string | null = null;
  try {
    scheduleContext = await loadScheduleContext(scheduler, userMessage);
  } catch {
    // Schedule context is best-effort — never break the primary flow
  }
  let enriched = injectMemory(withPrompt, memory);
  if (scheduleContext) {
    enriched = injectScheduleContext(enriched, scheduleContext);
  }

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
      messages: buildMessages(enriched),
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
  const rawResponse = choice?.message?.content ?? "";

  // Extract and process any schedule commands from the response
  const { cleanContent, commands } = extractScheduleCommands(rawResponse);

  if (commands.length > 0) {
    ctx.waitUntil(
      processScheduleCommands(scheduler, commands).catch(() => {})
    );
  }

  const result: CompletionResponse = {
    content: cleanContent,
    model: data.model ?? model,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
        }
      : undefined,
  };

  ctx.waitUntil(
    processMemoryInBackground(
      env.MEMORY_KV,
      env.OPENROUTER_API_KEY,
      userMessage,
      cleanContent
    )
  );

  return Response.json(result);
}

async function collectStreamContent(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let content = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    // Parse SSE lines for content deltas
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) content += delta;
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return content;
}

async function handleStream(
  req: CompletionRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const model = req.model ?? DEFAULT_MODEL;
  const userMessage = getLastUserMessage(req);
  const withPrompt = applySystemPrompt(req);
  const scheduler = new SchedulerClient(env.SCHEDULER);

  const memory = await loadMemory(env.MEMORY_KV);
  let scheduleCtx: string | null = null;
  try {
    scheduleCtx = await loadScheduleContext(scheduler, userMessage);
  } catch {
    // Schedule context is best-effort — never break the primary flow
  }
  let enriched = injectMemory(withPrompt, memory);
  if (scheduleCtx) {
    enriched = injectScheduleContext(enriched, scheduleCtx);
  }

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
      messages: buildMessages(enriched),
      plugins: [{ id: "web" }],
      stream: true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  // Tee the stream: one for the client, one for memory + schedule extraction
  const [clientStream, captureStream] = response.body!.tee();

  ctx.waitUntil(
    collectStreamContent(captureStream).then(async (rawResponse) => {
      const { cleanContent, commands } =
        extractScheduleCommands(rawResponse);

      await Promise.all([
        processMemoryInBackground(
          env.MEMORY_KV,
          env.OPENROUTER_API_KEY,
          userMessage,
          cleanContent
        ),
        commands.length > 0
          ? processScheduleCommands(scheduler, commands).catch(() => {})
          : Promise.resolve(),
      ]);
    })
  );

  return new Response(clientStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function injectScheduleContext(
  req: CompletionRequest,
  scheduleContext: string
): CompletionRequest {
  const system = req.system
    ? `${req.system}\n\n---\n\n${scheduleContext}`
    : scheduleContext;
  return { ...req, system };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (!authenticate(request, env)) {
      return unauthorized();
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const url = new URL(request.url);

    // Proxy schedule routes to the scheduler worker
    if (url.pathname.startsWith("/v1/schedules")) {
      try {
        const schedulerPath = url.pathname.replace("/v1/schedules", "/schedules");
        return await env.SCHEDULER.fetch(
          new Request(`https://internal${schedulerPath}`, {
            method: request.method,
            headers: request.headers,
            body: request.body,
          })
        );
      } catch {
        return new Response("Scheduler unavailable", { status: 502 });
      }
    }

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
        return handleComplete(body, env, ctx);
      case "/v1/stream":
        return handleStream(body, env, ctx);
      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
