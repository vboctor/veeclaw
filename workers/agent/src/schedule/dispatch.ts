import type {
  CompletionRequest,
  ScheduleEntry,
  PromptScheduleEntry,
  ActionScheduleEntry,
} from "@veeclaw/shared";
import { toTelegramMarkdown } from "@veeclaw/shared";
import type { Env } from "../index.ts";
import { loadMemory, loadMemoryData, injectMemory } from "../memory/load.ts";
import { saveMemoryData } from "../memory/store.ts";
import { appendToWorkingMemory } from "../memory/update.ts";
import { extractFacts } from "../memory/extract.ts";
import { getOrchestrator } from "../agents/loader.ts";
import { resolveSkills } from "../skills/registry.ts";
import { runAgent } from "../agents/runner.ts";
import {
  handleDelegation,
  DELEGATE_TOOL,
  buildAgentListing,
} from "../tools/delegate.ts";

const TELEGRAM_API = "https://api.telegram.org";

function applySystemPrompt(
  req: CompletionRequest,
  prompt: string
): CompletionRequest {
  const now = new Date();
  const timeContext = `Current datetime: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${now.toLocaleTimeString("en-US", { hour12: true })})`;

  const agentListing = buildAgentListing();
  const base = `${prompt}\n\n${agentListing}\n\n${timeContext}`;
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
  const converted = toTelegramMarkdown(text);
  const chunks = chunkText(converted, 4096);
  for (const chunk of chunks) {
    const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "MarkdownV2",
      }),
    });
    // Fallback to plain text if MarkdownV2 parsing fails
    if (!res.ok) {
      await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
      });
    }
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
  const orchestrator = getOrchestrator();
  const { tools: skillTools, routes, connectorMap, plugins, prompts } =
    resolveSkills(orchestrator.skills);

  let prompt = orchestrator.prompt;
  if (prompts.length > 0) {
    prompt += `\n\n${prompts.join("\n\n")}`;
  }

  const req: CompletionRequest = {
    system: `This is a scheduled task execution. After completing any actions (sending emails, creating events, etc.), always provide a brief confirmation of what was done. For example: "Sent email about <topic> to <address>" or "Created calendar event <title> for <date>".`,
    messages: [{ role: "user", content: entry.event.content }],
    tools: [...skillTools, DELEGATE_TOOL],
    model: orchestrator.model,
    plugins: plugins.length > 0 ? plugins : undefined,
  };

  const withPrompt = applySystemPrompt(req, prompt);
  const memory = await loadMemory(env.AGENT_KV);
  const enriched = injectMemory(withPrompt, memory);

  const data = await runAgent({
    request: enriched,
    env,
    routes,
    connectorMap,
    onDelegateCall: (agentId, task, instructions) =>
      handleDelegation(agentId, task, instructions, env),
  });

  const content = data.content;

  if (content && env.DEFAULT_CHAT_ID) {
    await sendTelegram(
      env.TELEGRAM_BOT_TOKEN,
      env.DEFAULT_CHAT_ID,
      `📋 **${entry.label}**\n\n${content}`
    );
  }

  const memoryTask = (async () => {
    let data = await loadMemoryData(env.AGENT_KV);
    data = await appendToWorkingMemory(
      data,
      env.LLM_GATEWAY,
      entry.event.content,
      content
    );
    data = await extractFacts(
      data,
      env.LLM_GATEWAY,
      entry.event.content,
      content
    );
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
            await sendTelegram(
              env.TELEGRAM_BOT_TOKEN,
              env.DEFAULT_CHAT_ID,
              msg
            );
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
