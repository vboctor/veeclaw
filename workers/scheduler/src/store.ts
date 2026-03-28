import type { ScheduleEntry, PromptScheduleEntry } from "@scaf/shared";
import { SCHEDULE_PREFIX } from "@scaf/shared";
import { CronExpressionParser } from "cron-parser";

export async function listSchedules(
  kv: KVNamespace
): Promise<ScheduleEntry[]> {
  const list = await kv.list({ prefix: SCHEDULE_PREFIX });
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await kv.get(k.name);
      return raw ? (JSON.parse(raw) as ScheduleEntry) : null;
    })
  );
  return entries.filter((e): e is ScheduleEntry => e !== null);
}

export async function getSchedule(
  kv: KVNamespace,
  id: string
): Promise<ScheduleEntry | null> {
  const raw = await kv.get(`${SCHEDULE_PREFIX}${id}`);
  return raw ? (JSON.parse(raw) as ScheduleEntry) : null;
}

export async function addSchedule(
  kv: KVNamespace,
  entry: ScheduleEntry
): Promise<void> {
  const ttlOpts =
    entry.type === "one-shot"
      ? {
          expirationTtl: Math.ceil((entry.nextRun - Date.now()) / 1000) + 3600,
        }
      : undefined;

  await kv.put(
    `${SCHEDULE_PREFIX}${entry.id}`,
    JSON.stringify(entry),
    ttlOpts
  );
}

export async function deleteSchedule(
  kv: KVNamespace,
  id: string
): Promise<boolean> {
  const existing = await getSchedule(kv, id);
  if (!existing) return false;
  await kv.delete(`${SCHEDULE_PREFIX}${id}`);
  return true;
}

export async function updateSchedule(
  kv: KVNamespace,
  id: string,
  updates: {
    label?: string;
    cron?: string;
    content?: string;
    maxRuns?: number;
    activeHours?: ScheduleEntry["activeHours"];
  }
): Promise<ScheduleEntry | null> {
  const existing = await getSchedule(kv, id);
  if (!existing) return null;

  const updated = { ...existing };

  if (updates.label) updated.label = updates.label;
  if (updates.activeHours) updated.activeHours = updates.activeHours;
  if (updates.maxRuns !== undefined) updated.maxRuns = updates.maxRuns;

  if (updates.cron && updated.type === "recurring") {
    updated.cron = updates.cron;
    const interval = CronExpressionParser.parse(updates.cron, {
      currentDate: new Date(),
    });
    updated.nextRun = interval.next().toDate().getTime();
  }

  if (updates.content && updated.mode === "prompt") {
    (updated as PromptScheduleEntry).event.content = updates.content;
  }

  await kv.put(`${SCHEDULE_PREFIX}${id}`, JSON.stringify(updated));
  return updated;
}

export function buildScheduleEntry(
  partial: Record<string, unknown>,
  nextRunIso?: string
): ScheduleEntry {
  const now = Date.now();

  let nextRun: number;
  if (nextRunIso) {
    const ts = new Date(nextRunIso).getTime();
    nextRun = !isNaN(ts) && ts > now ? ts : now;
  } else if (partial.cron && typeof partial.cron === "string") {
    const interval = CronExpressionParser.parse(partial.cron, {
      currentDate: new Date(),
    });
    nextRun = interval.next().toDate().getTime();
  } else {
    nextRun = now;
  }

  return {
    ...partial,
    nextRun,
    createdAt: now,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
  } as ScheduleEntry;
}
