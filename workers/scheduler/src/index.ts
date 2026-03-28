import { runHeartbeat } from "./heartbeat.ts";
import {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  buildScheduleEntry,
} from "./store.ts";

export interface Env {
  SCHEDULER_KV: KVNamespace;
  LLM_GATEWAY: Fetcher;
  LLM_GATEWAY_TOKEN?: string;
  TELEGRAM_BOT_TOKEN: string;
  DEFAULT_CHAT_ID: string;
}

async function handleScheduleRoutes(
  request: Request,
  url: URL,
  env: Env
): Promise<Response> {
  // GET /schedules — list all
  if (request.method === "GET" && url.pathname === "/schedules") {
    const entries = await listSchedules(env.SCHEDULER_KV);
    return Response.json(entries);
  }

  // GET /schedules/:id — get one
  if (request.method === "GET" && url.pathname.startsWith("/schedules/")) {
    const id = url.pathname.slice("/schedules/".length);
    const entry = await getSchedule(env.SCHEDULER_KV, id);
    if (!entry) return new Response("Not found", { status: 404 });
    return Response.json(entry);
  }

  // POST /schedules — create
  if (request.method === "POST" && url.pathname === "/schedules") {
    const body = (await request.json()) as {
      entry: Record<string, unknown>;
      nextRunIso?: string;
    };
    const entry = buildScheduleEntry(body.entry, body.nextRunIso);
    await addSchedule(env.SCHEDULER_KV, entry);
    return Response.json(entry, { status: 201 });
  }

  // PUT /schedules/:id — update
  if (request.method === "PUT" && url.pathname.startsWith("/schedules/")) {
    const id = url.pathname.slice("/schedules/".length);
    const updates = (await request.json()) as Parameters<typeof updateSchedule>[2];
    const updated = await updateSchedule(env.SCHEDULER_KV, id, updates);
    if (!updated) return new Response("Not found", { status: 404 });
    return Response.json(updated);
  }

  // DELETE /schedules/:id — delete
  if (request.method === "DELETE" && url.pathname.startsWith("/schedules/")) {
    const id = url.pathname.slice("/schedules/".length);
    const deleted = await deleteSchedule(env.SCHEDULER_KV, id);
    if (!deleted) return new Response("Not found", { status: 404 });
    return new Response(null, { status: 204 });
  }

  return new Response("Not found", { status: 404 });
}

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
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (url.pathname.startsWith("/schedules")) {
      return handleScheduleRoutes(request, url, env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
