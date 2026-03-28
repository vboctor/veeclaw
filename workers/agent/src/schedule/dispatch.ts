import type {
  CompletionRequest,
  CompletionResponse,
  ScheduleEntry,
  PromptScheduleEntry,
  ActionScheduleEntry,
} from "@scaf/shared";
import type { Env } from "../index.ts";
import { loadMemory, injectMemory } from "../memory/load.ts";
import { appendToWorkingMemory } from "../memory/update.ts";
import { extractFacts } from "../memory/extract.ts";
import {
  extractScheduleCommands,
  processScheduleCommands,
} from "./extract.ts";
import SYSTEM_PROMPT from "../prompts/system.md";

const TELEGRAM_API = "https://api.telegram.org";

function applySystemPrompt(req: CompletionRequest): CompletionRequest {
  const now = new Date();
  const timeContext = `Current datetime: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${now.toLocaleTimeString("en-US", { hour12: true })})`;

  const base = `${SYSTEM_PROMPT}\n\n${timeContext}`;
  const system = req.system ? `${base}\n\n---\n\n${req.system}` : base;
  return { ...req, system };
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let breakAt = remaining.lastIndexOf("\n\n", maxLen);
    if (breakAt <= 0) breakAt = remaining.lastIndexOf("\n", maxLen);
    if (breakAt <= 0) breakAt = remaining.lastIndexOf(" ", maxLen);
    if (breakAt <= 0) breakAt = maxLen;
    chunks.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  return chunks;
}

async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  const chunks = chunkText(text, 4096);
  for (const chunk of chunks) {
    await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      }),
    });
  }
}

/**
 * Execute a schedule entry: run prompt through LLM or execute action.
 * Called by both the /v1/dispatch HTTP route and the heartbeat cron.
 */
export async function dispatchScheduleEntry(
  entry: ScheduleEntry,
  env: Env,
  ctx?: ExecutionContext
): Promise<{ ok: boolean }> {
  try {
    if (entry.mode === "prompt") {
      await dispatchPrompt(entry, env, ctx);
    } else {
      await dispatchAction(entry, env);
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[agent:dispatch] Error for ${entry.id}: ${message}`);
    return { ok: false };
  }
}

async function dispatchPrompt(
  entry: PromptScheduleEntry,
  env: Env,
  ctx?: ExecutionContext
): Promise<void> {
  const req: CompletionRequest = {
    messages: [{ role: "user", content: entry.event.content }],
  };

  const withPrompt = applySystemPrompt(req);
  const memory = await loadMemory(env.AGENT_KV);
  const enriched = injectMemory(withPrompt, memory);

  const response = await env.LLM_GATEWAY.fetch(
    "https://internal/v1/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enriched),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM gateway error: ${text}`);
  }

  const data = (await response.json()) as CompletionResponse;
  const rawResponse = data.content;

  const { cleanContent, commands } = extractScheduleCommands(rawResponse);

  if (commands.length > 0) {
    const task = processScheduleCommands(env.AGENT_KV, commands).catch(
      () => {}
    );
    ctx ? ctx.waitUntil(task) : await task;
  }

  if (cleanContent && env.DEFAULT_CHAT_ID) {
    await sendTelegram(
      env.TELEGRAM_BOT_TOKEN,
      env.DEFAULT_CHAT_ID,
      `📋 **${entry.label}**\n\n${cleanContent}`
    );
  }

  const memoryTask = Promise.all([
    appendToWorkingMemory(
      env.AGENT_KV,
      env.LLM_GATEWAY,
      entry.event.content,
      cleanContent
    ),
    extractFacts(
      env.AGENT_KV,
      env.LLM_GATEWAY,
      entry.event.content,
      cleanContent
    ),
  ]).catch(() => {});
  ctx ? ctx.waitUntil(memoryTask) : await memoryTask;
}

async function dispatchAction(
  entry: ActionScheduleEntry,
  env: Env
): Promise<void> {
  const { action } = entry;

  switch (action.type) {
    case "send_message": {
      const chatId = action.to || env.DEFAULT_CHAT_ID;
      if (chatId) {
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, action.text);
      }
      break;
    }

    case "http_request": {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        action.timeout_ms ?? 5000
      );
      try {
        const res = await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
          signal: controller.signal,
        });
        if (action.expect_status && res.status !== action.expect_status) {
          console.error(
            `[agent:dispatch:${entry.id}] HTTP ${res.status}, expected ${action.expect_status}`
          );
        }
      } finally {
        clearTimeout(timer);
      }
      break;
    }
  }
}
