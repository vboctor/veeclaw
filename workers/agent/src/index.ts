import type {
  CompletionRequest,
  CompletionResponse,
  Message,
  ScheduleEntry,
} from "@scaf/shared";
import { loadMemory, injectMemory } from "./memory/load.ts";
import { appendToWorkingMemory } from "./memory/update.ts";
import { extractFacts } from "./memory/extract.ts";
import { loadScheduleContext } from "./schedule/context.ts";
import {
  extractScheduleCommands,
  processScheduleCommands,
} from "./schedule/extract.ts";
import {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  buildScheduleEntry,
} from "./schedule/store.ts";
import { runHeartbeat } from "./schedule/heartbeat.ts";
import { dispatchScheduleEntry } from "./schedule/dispatch.ts";
import SYSTEM_PROMPT from "./prompts/system.md";

export interface Env {
  AGENT_TOKEN?: string;
  AGENT_KV: KVNamespace;
  LLM_GATEWAY: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  DEFAULT_CHAT_ID: string;
}

function applySystemPrompt(req: CompletionRequest): CompletionRequest {
  const now = new Date();
  const pdt = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const timeContext = `Current datetime: ${now.toISOString()} | User's local time: ${pdt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${pdt.toLocaleTimeString("en-US", { hour12: true })} (America/Los_Angeles). Do not search for the current time — use this value directly.`;

  const base = `${SYSTEM_PROMPT}\n\n${timeContext}`;
  const system = req.system ? `${base}\n\n---\n\n${req.system}` : base;
  return { ...req, system };
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function authenticate(request: Request, env: Env): boolean {
  if (!env.AGENT_TOKEN) return true;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.AGENT_TOKEN}`;
}

function getLastUserMessage(req: CompletionRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === "user") return req.messages[i].content;
  }
  return "";
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

async function processMemoryInBackground(
  kv: KVNamespace,
  llmGateway: Fetcher,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    await Promise.all([
      appendToWorkingMemory(kv, llmGateway, userMessage, assistantResponse),
      extractFacts(kv, llmGateway, userMessage, assistantResponse),
    ]);
  } catch {
    // Memory ops are best-effort — never break the primary flow
  }
}

async function callLLMGateway(
  env: Env,
  req: CompletionRequest,
  stream: boolean
): Promise<Response> {
  const endpoint = stream ? "/v1/stream" : "/v1/complete";
  return env.LLM_GATEWAY.fetch(`https://internal${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, stream }),
  });
}

// ── Completion handlers ───────────────────────────────────────────

async function handleComplete(
  req: CompletionRequest,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const userMessage = getLastUserMessage(req);
  const withPrompt = applySystemPrompt(req);

  const memory = await loadMemory(env.AGENT_KV);
  let scheduleContext: string | null = null;
  try {
    scheduleContext = await loadScheduleContext(env.AGENT_KV, userMessage);
  } catch {
    // Schedule context is best-effort
  }
  let enriched = injectMemory(withPrompt, memory);
  if (scheduleContext) {
    enriched = injectScheduleContext(enriched, scheduleContext);
  }

  const response = await callLLMGateway(env, enriched, false);

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  const data = (await response.json()) as CompletionResponse;
  const rawResponse = data.content;

  const { cleanContent, commands } = extractScheduleCommands(rawResponse);

  if (commands.length > 0) {
    ctx.waitUntil(
      processScheduleCommands(env.AGENT_KV, commands).catch(() => {})
    );
  }

  const result: CompletionResponse = {
    ...data,
    content: cleanContent,
  };

  ctx.waitUntil(
    processMemoryInBackground(
      env.AGENT_KV,
      env.LLM_GATEWAY,
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
  const userMessage = getLastUserMessage(req);
  const withPrompt = applySystemPrompt(req);

  const memory = await loadMemory(env.AGENT_KV);
  let scheduleCtx: string | null = null;
  try {
    scheduleCtx = await loadScheduleContext(env.AGENT_KV, userMessage);
  } catch {
    // Schedule context is best-effort
  }
  let enriched = injectMemory(withPrompt, memory);
  if (scheduleCtx) {
    enriched = injectScheduleContext(enriched, scheduleCtx);
  }

  const response = await callLLMGateway(env, enriched, true);

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  const [clientStream, captureStream] = response.body!.tee();

  ctx.waitUntil(
    collectStreamContent(captureStream).then(async (rawResponse) => {
      const { cleanContent, commands } =
        extractScheduleCommands(rawResponse);

      await Promise.all([
        processMemoryInBackground(
          env.AGENT_KV,
          env.LLM_GATEWAY,
          userMessage,
          cleanContent
        ),
        commands.length > 0
          ? processScheduleCommands(env.AGENT_KV, commands).catch(() => {})
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

// ── Schedule CRUD routes ──────────────────────────────────────────

async function handleScheduleRoutes(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const kv = env.AGENT_KV;

  if (request.method === "GET" && url.pathname === "/v1/schedules") {
    const entries = await listSchedules(kv);
    return Response.json(entries);
  }

  if (request.method === "GET" && url.pathname.startsWith("/v1/schedules/")) {
    const id = url.pathname.slice("/v1/schedules/".length);
    const entry = await getSchedule(kv, id);
    if (!entry) return new Response("Not found", { status: 404 });
    return Response.json(entry);
  }

  if (request.method === "POST" && url.pathname === "/v1/schedules") {
    const body = (await request.json()) as {
      entry: Record<string, unknown>;
      nextRunIso?: string;
    };
    const entry = buildScheduleEntry(body.entry, body.nextRunIso);
    await addSchedule(kv, entry);
    return Response.json(entry, { status: 201 });
  }

  if (request.method === "PUT" && url.pathname.startsWith("/v1/schedules/")) {
    const id = url.pathname.slice("/v1/schedules/".length);
    const updates = (await request.json()) as Parameters<typeof updateSchedule>[2];
    const updated = await updateSchedule(kv, id, updates);
    if (!updated) return new Response("Not found", { status: 404 });
    return Response.json(updated);
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/v1/schedules/")) {
    const id = url.pathname.slice("/v1/schedules/".length);
    const deleted = await deleteSchedule(kv, id);
    if (!deleted) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 204 });
  }

  return new Response("Not found", { status: 404 });
}

// ── Worker entrypoint ─────────────────────────────────────────────

export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(runHeartbeat(env));
  },

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

    // Schedule CRUD routes
    if (url.pathname.startsWith("/v1/schedules")) {
      return handleScheduleRoutes(request, url, env);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/v1/dispatch") {
      let entry: ScheduleEntry;
      try {
        entry = (await request.json()) as ScheduleEntry;
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }
      const result = await dispatchScheduleEntry(entry, env, ctx);
      return result.ok
        ? Response.json({ ok: true })
        : Response.json({ ok: false }, { status: 500 });
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
