import type {
  ScheduleEntry,
  PromptScheduleEntry,
  ActionScheduleEntry,
  CompletionResponse,
} from "@scaf/shared";
import { SCHEDULE_PREFIX } from "@scaf/shared";
import { CronExpressionParser } from "cron-parser";
import type { Env } from "./index.ts";

const TELEGRAM_API = "https://api.telegram.org";

// 5-minute interval → ±2.5 min window for matching
const WINDOW_MS = 150_000;

export async function runHeartbeat(env: Env): Promise<void> {
  const now = Date.now();

  const list = await env.SCHEDULER_KV.list({ prefix: SCHEDULE_PREFIX });
  if (list.keys.length === 0) return;

  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.SCHEDULER_KV.get(k.name);
      return raw ? (JSON.parse(raw) as ScheduleEntry) : null;
    })
  );

  const windowStart = now - WINDOW_MS;
  const windowEnd = now + WINDOW_MS;

  const due = entries.filter(
    (e): e is ScheduleEntry =>
      e !== null &&
      e.nextRun >= windowStart &&
      e.nextRun <= windowEnd &&
      isWithinActiveHours(e, now) &&
      !hasReachedMaxRuns(e)
  );

  if (due.length === 0) return;

  console.log(`[scheduler] ${due.length} entries due, dispatching...`);
  await Promise.all(due.map((entry) => dispatch(entry, now, env)));
}

async function dispatch(
  entry: ScheduleEntry,
  now: number,
  env: Env
): Promise<void> {
  let success = true;
  try {
    if (entry.mode === "prompt") {
      await dispatchPrompt(entry, now, env);
    } else {
      await dispatchAction(entry, now, env);
    }
  } catch (err) {
    success = false;
    console.error(`[scheduler] Error dispatching ${entry.id}:`, err);
  }

  const newRunCount = entry.runCount + 1;
  const newSuccessCount = (entry.successCount ?? 0) + (success ? 1 : 0);
  const newFailureCount = (entry.failureCount ?? 0) + (success ? 0 : 1);

  // One-shot entries are always deleted after firing
  if (entry.type === "one-shot") {
    await env.SCHEDULER_KV.delete(`${SCHEDULE_PREFIX}${entry.id}`);
    return;
  }

  // Recurring: check if maxRuns reached after this run
  if (entry.maxRuns !== undefined && newRunCount >= entry.maxRuns) {
    console.log(`[scheduler] ${entry.id} reached maxRuns (${entry.maxRuns}), removing`);
    await env.SCHEDULER_KV.delete(`${SCHEDULE_PREFIX}${entry.id}`);
    return;
  }

  // Recurring: compute next run and persist updated counters
  if (entry.cron) {
    const nextRun = computeNextRun(entry.cron, now);
    const updated: ScheduleEntry = {
      ...entry,
      nextRun,
      lastRun: now,
      lastRunStatus: success ? "success" : "failure",
      runCount: newRunCount,
      successCount: newSuccessCount,
      failureCount: newFailureCount,
    };
    await env.SCHEDULER_KV.put(
      `${SCHEDULE_PREFIX}${entry.id}`,
      JSON.stringify(updated)
    );
  }
}

async function dispatchPrompt(
  entry: PromptScheduleEntry,
  _now: number,
  env: Env
): Promise<void> {
  // Call LLM gateway with the schedule prompt
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.LLM_GATEWAY_TOKEN) {
    headers["Authorization"] = `Bearer ${env.LLM_GATEWAY_TOKEN}`;
  }

  const res = await env.LLM_GATEWAY.fetch("https://internal/v1/complete", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: entry.event.content }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[scheduler] LLM gateway error for ${entry.id}: ${text}`);
    return;
  }

  const data = (await res.json()) as CompletionResponse;
  const responseText = data.content;

  if (responseText && env.DEFAULT_CHAT_ID) {
    await sendTelegram(
      env.TELEGRAM_BOT_TOKEN,
      env.DEFAULT_CHAT_ID,
      `📋 **${entry.label}**\n\n${responseText}`
    );
  }
}

async function dispatchAction(
  entry: ActionScheduleEntry,
  _now: number,
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
            `[scheduler:${entry.id}] HTTP ${res.status}, expected ${action.expect_status}`
          );
        }
      } finally {
        clearTimeout(timer);
      }
      break;
    }
  }
}

async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  // Chunk to fit Telegram's 4096 char limit
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

function computeNextRun(cronExpr: string, fromNow: number): number {
  const expr = CronExpressionParser.parse(cronExpr, {
    currentDate: new Date(fromNow),
  });
  return expr.next().toDate().getTime();
}

function hasReachedMaxRuns(entry: ScheduleEntry): boolean {
  if (entry.maxRuns === undefined) return false;
  return entry.runCount >= entry.maxRuns;
}

function isWithinActiveHours(entry: ScheduleEntry, now: number): boolean {
  if (!entry.activeHours) return true;
  const { start, end, timezone } = entry.activeHours;
  const hour = parseInt(
    new Date(now).toLocaleString("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }),
    10
  );
  return hour >= start && hour < end;
}
