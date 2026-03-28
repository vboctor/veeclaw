import type { ScheduleEntry } from "@scaf/shared";
import { listSchedules } from "./store.ts";

const SCHEDULE_KEYWORDS = [
  "schedule",
  "scheduled",
  "schedules",
  "reminder",
  "reminders",
  "recurring",
  "cron",
  "every day",
  "every week",
  "every hour",
  "every morning",
  "every evening",
  "daily",
  "weekly",
  "hourly",
];

/**
 * Check if the user message is likely about scheduling.
 * Used to decide whether to load schedule context.
 */
export function isScheduleRelated(userMessage: string): boolean {
  const lower = userMessage.toLowerCase();
  return SCHEDULE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Format schedule entries into a context block for the system prompt.
 */
export function formatScheduleContext(entries: ScheduleEntry[]): string {
  if (entries.length === 0) {
    return "## Active Schedules\n\nNo schedules configured.";
  }

  const lines = entries.map((e) => {
    const frequency =
      e.type === "recurring" && e.cron
        ? cronToHuman(e.cron)
        : "one-shot";
    const lastRun = e.lastRun
      ? `${new Date(e.lastRun).toISOString()} (${e.lastRunStatus ?? "unknown"})`
      : "never";
    const runsOf = e.maxRuns !== undefined ? `${e.runCount}/${e.maxRuns}` : `${e.runCount}/*`;
    const successFail = `success: ${e.successCount ?? 0}, failure: ${e.failureCount ?? 0}`;
    const mode = e.mode === "prompt" ? "prompt" : `action:${e.mode === "action" ? e.action.type : ""}`;
    const detail =
      e.mode === "prompt"
        ? `prompt: "${e.event.content}"`
        : `action: ${JSON.stringify(e.mode === "action" ? e.action : {})}`;

    return `- **${e.label}** (id: \`${e.id}\`)\n  frequency: ${frequency} | mode: ${mode} | last run: ${lastRun}\n  runs: ${runsOf} | ${successFail}\n  ${detail}`;
  });

  return `## Active Schedules\n\n${lines.join("\n\n")}`;
}

/**
 * Load schedule context if the message is schedule-related.
 */
export async function loadScheduleContext(
  kv: KVNamespace,
  userMessage: string
): Promise<string | null> {
  if (!isScheduleRelated(userMessage)) return null;
  const entries = await listSchedules(kv);
  return formatScheduleContext(entries);
}

/**
 * Simple cron-to-human description. Covers common patterns.
 */
function cronToHuman(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [min, hour, dom, _mon, dow] = parts;

  // Every N minutes
  if (min.startsWith("*/") && hour === "*" && dom === "*" && dow === "*") {
    return `every ${min.slice(2)} minutes`;
  }

  // Every N hours
  if (min !== "*" && hour.startsWith("*/") && dom === "*") {
    return `every ${hour.slice(2)} hours at :${min.padStart(2, "0")}`;
  }

  // Specific time daily
  if (min !== "*" && hour !== "*" && dom === "*" && dow === "*") {
    return `daily at ${hour}:${min.padStart(2, "0")}`;
  }

  // Specific time on certain days
  if (min !== "*" && hour !== "*" && dom === "*" && dow !== "*") {
    const days = dow
      .split(",")
      .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parseInt(d)] ?? d)
      .join(", ");
    return `${days} at ${hour}:${min.padStart(2, "0")}`;
  }

  return cron;
}
