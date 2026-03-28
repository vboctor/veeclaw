import type {
  CompletionRequest,
  CompletionResponse,
  Message,
  ScheduleEntry,
  PromptScheduleEntry,
  ActionScheduleEntry,
} from "@scaf/shared";
import type { Env } from "../index.ts";
import { loadMemory, loadMemoryData, injectMemory } from "../memory/load.ts";
import { saveMemoryData } from "../memory/store.ts";
import { appendToWorkingMemory } from "../memory/update.ts";
import { extractFacts } from "../memory/extract.ts";
import {
  extractScheduleCommands,
  processScheduleCommands,
} from "./extract.ts";
import { GOOGLE_TOOLS } from "../tools/google.ts";
import { executeToolCalls } from "../tools/execute.ts";
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

const MAX_TOOL_ROUNDS = 5;

async function callLLMGateway(
  env: Env,
  req: CompletionRequest,
): Promise<CompletionResponse> {
  const response = await env.LLM_GATEWAY.fetch(
    "https://internal/v1/complete",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM gateway error: ${text}`);
  }

  return (await response.json()) as CompletionResponse;
}

async function dispatchPrompt(
  entry: PromptScheduleEntry,
  env: Env,
  ctx?: ExecutionContext
): Promise<void> {
  const req: CompletionRequest = {
    system: `This is a scheduled task execution. After completing any actions (sending emails, creating events, etc.), always provide a brief confirmation of what was done. For example: "Sent email about <topic> to <address>" or "Created calendar event <title> for <date>".`,
    messages: [{ role: "user", content: entry.event.content }],
    tools: GOOGLE_TOOLS,
  };

  const withPrompt = applySystemPrompt(req);
  const memory = await loadMemory(env.AGENT_KV);
  const enriched = injectMemory(withPrompt, memory);

  // Tool execution loop
  let currentReq = enriched;
  let data: CompletionResponse;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    data = await callLLMGateway(env, currentReq);

    if (!data.tool_calls?.length) break;

    const toolResults = await executeToolCalls(data.tool_calls, env.GOOGLE_CONNECTOR);

    const assistantMsg: Message = {
      role: "assistant",
      content: data.content || "",
      tool_calls: data.tool_calls,
    };

    currentReq = {
      ...currentReq,
      messages: [...currentReq.messages, assistantMsg, ...toolResults],
    };
  }

  const rawResponse = data!.content;
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

  const memoryTask = (async () => {
    let data = await loadMemoryData(env.AGENT_KV);
    data = await appendToWorkingMemory(data, env.LLM_GATEWAY, entry.event.content, cleanContent);
    data = await extractFacts(data, env.LLM_GATEWAY, entry.event.content, cleanContent);
    await saveMemoryData(env.AGENT_KV, data);
  })().catch(() => {});
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
      // send_message actions are themselves user-visible — no extra confirmation needed
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
          const msg = `⚠️ **${entry.label}** — HTTP ${res.status} (expected ${action.expect_status})`;
          if (env.DEFAULT_CHAT_ID) {
            await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.DEFAULT_CHAT_ID, msg);
          }
        } else if (env.DEFAULT_CHAT_ID) {
          await sendTelegram(
            env.TELEGRAM_BOT_TOKEN,
            env.DEFAULT_CHAT_ID,
            `✅ **${entry.label}** — completed (HTTP ${res.status})`
          );
        }
      } finally {
        clearTimeout(timer);
      }
      break;
    }
  }
}
