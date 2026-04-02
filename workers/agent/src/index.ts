import type {
  CacheSegment,
  CompletionRequest,
  CompletionResponse,
  Message,
  ScheduleEntry,
} from "@veeclaw/shared";
import { loadMemory, loadMemoryData } from "./memory/load.ts";
import { injectMemory } from "./memory/load.ts";
import { saveMemoryData } from "./memory/store.ts";
import { appendToWorkingMemory } from "./memory/update.ts";
import { extractFacts } from "./memory/extract.ts";
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
import { getOrchestrator } from "./agents/loader.ts";
import { resolveSkills } from "./skills/registry.ts";
import { runAgent, runAgentWithUsage } from "./agents/runner.ts";
import {
  DELEGATE_TOOL,
  handleDelegation,
  buildAgentListing,
} from "./tools/delegate.ts";

export interface Env {
  AGENT_TOKEN: string;
  AGENT_KV: KVNamespace;
  LLM_GATEWAY: Fetcher;
  GOOGLE_CONNECTOR: Fetcher;
  GITHUB_CONNECTOR: Fetcher;
  MANTISHUB_CONNECTOR: Fetcher;
  TODOIST_CONNECTOR: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  DEFAULT_CHAT_ID: string;
}

function buildTimeContext(): string {
  const now = new Date();
  now.setSeconds(0, 0); // Coarsen to minute granularity for cacheability
  const pdt = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  return `Current time: ${now.toISOString()} | Local: ${pdt.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })} ${pdt.toLocaleTimeString("en-US", { hour12: true })} PT`;
}

function applySystemPrompt(
  req: CompletionRequest,
  prompt: string,
  opts: {
    skillPrompts?: string[];
  } = {}
): CompletionRequest {
  // Segment 1: static prefix (cached) — agent prompt + listing + skills
  const staticParts = [prompt, buildAgentListing()];
  if (opts.skillPrompts?.length) {
    staticParts.push(...opts.skillPrompts);
  }

  const segments: CacheSegment[] = [
    { text: staticParts.join("\n\n"), cache_control: { type: "ephemeral" } },
  ];

  // Segment 2: dynamic suffix (uncached) — time context + caller system
  const dynamicParts = [buildTimeContext()];
  if (req.system && typeof req.system === "string") {
    dynamicParts.push(req.system);
  }
  segments.push({ text: dynamicParts.join("\n\n") });

  return { ...req, system: segments };
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function authenticate(request: Request, env: Env): boolean {
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.AGENT_TOKEN}`;
}

function getLastUserMessage(req: CompletionRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    if (req.messages[i].role === "user") return req.messages[i].content;
  }
  return "";
}

async function processMemoryInBackground(
  kv: KVNamespace,
  llmGateway: Fetcher,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  try {
    let data = await loadMemoryData(kv);
    data = await appendToWorkingMemory(
      data,
      llmGateway,
      userMessage,
      assistantResponse
    );
    data = await extractFacts(
      data,
      llmGateway,
      userMessage,
      assistantResponse
    );
    await saveMemoryData(kv, data);
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
  const orchestrator = getOrchestrator();
  const { tools: skillTools, routes, connectorMap, plugins, prompts } =
    resolveSkills(orchestrator.skills);

  const withPrompt = applySystemPrompt(req, orchestrator.prompt, {
    skillPrompts: prompts,
  });

  const memory = await loadMemory(env.AGENT_KV);
  let enriched = injectMemory(withPrompt, memory);

  // Inject tools: skill tools + delegation tool
  enriched = {
    ...enriched,
    tools: [...skillTools, DELEGATE_TOOL],
    model: orchestrator.model,
    plugins: plugins.length > 0 ? plugins : undefined,
  };

  const { response: data, usage } = await runAgentWithUsage({
    request: enriched,
    env,
    routes,
    connectorMap,
    maxRounds: 10,
    onDelegateCall: (agentId, task, instructions) =>
      handleDelegation(agentId, task, instructions, env),
  });

  console.log(
    `[agent] rounds=${usage.rounds} prompt=${usage.totalPromptTokens} completion=${usage.totalCompletionTokens} cache_write=${usage.totalCacheWriteTokens} cache_read=${usage.totalCacheReadTokens}`
  );

  const result: CompletionResponse = {
    ...data,
    content: data.content,
    tool_calls: undefined,
  };

  ctx.waitUntil(
    processMemoryInBackground(
      env.AGENT_KV,
      env.LLM_GATEWAY,
      userMessage,
      data.content
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
  const orchestrator = getOrchestrator();
  const { plugins, prompts } = resolveSkills(orchestrator.skills);

  const withPrompt = applySystemPrompt(req, orchestrator.prompt, {
    skillPrompts: prompts,
  });

  const memory = await loadMemory(env.AGENT_KV);
  let enriched = injectMemory(withPrompt, memory);

  enriched = {
    ...enriched,
    model: orchestrator.model,
    plugins: plugins.length > 0 ? plugins : undefined,
  };

  const response = await callLLMGateway(env, enriched, true);

  if (!response.ok) {
    const text = await response.text();
    return new Response(text, { status: response.status });
  }

  const [clientStream, captureStream] = response.body!.tee();

  ctx.waitUntil(
    collectStreamContent(captureStream).then(async (content) => {
      await processMemoryInBackground(
        env.AGENT_KV,
        env.LLM_GATEWAY,
        userMessage,
        content
      );
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

// ── Memory routes ────────────────────────────────────────────────

async function handleMemoryRoutes(
  request: Request,
  env: Env
): Promise<Response> {
  const kv = env.AGENT_KV;

  if (request.method === "GET") {
    const data = await loadMemoryData(kv);
    return Response.json(data);
  }

  if (request.method === "PUT") {
    const data = (await request.json()) as Parameters<typeof saveMemoryData>[1];
    await saveMemoryData(kv, data);
    return new Response(null, { status: 204 });
  }

  return new Response("Method not allowed", { status: 405 });
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
    const updates = (await request.json()) as Parameters<
      typeof updateSchedule
    >[2];
    const updated = await updateSchedule(kv, id, updates);
    if (!updated) return new Response("Not found", { status: 404 });
    return Response.json(updated);
  }

  if (
    request.method === "DELETE" &&
    url.pathname.startsWith("/v1/schedules/")
  ) {
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
    await runHeartbeat(env);
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

    // Memory routes
    if (url.pathname === "/v1/memory") {
      return handleMemoryRoutes(request, env);
    }

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
