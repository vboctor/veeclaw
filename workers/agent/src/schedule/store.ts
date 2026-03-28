import type { ScheduleEntry, PromptScheduleEntry } from "@scaf/shared";
import { CronExpressionParser } from "cron-parser";

const SCHEDULES_KEY = "schedules";

async function loadAll(kv: KVNamespace): Promise<Record<string, ScheduleEntry>> {
  const raw = await kv.get(SCHEDULES_KEY);
  return raw ? (JSON.parse(raw) as Record<string, ScheduleEntry>) : {};
}

async function saveAll(kv: KVNamespace, entries: Record<string, ScheduleEntry>): Promise<void> {
  await kv.put(SCHEDULES_KEY, JSON.stringify(entries));
}

export { loadAll, saveAll, SCHEDULES_KEY };

export async function listSchedules(
  kv: KVNamespace
): Promise<ScheduleEntry[]> {
  const entries = await loadAll(kv);
  return Object.values(entries);
}

export async function getSchedule(
  kv: KVNamespace,
  id: string
): Promise<ScheduleEntry | null> {
  const entries = await loadAll(kv);
  return entries[id] ?? null;
}

export async function addSchedule(
  kv: KVNamespace,
  entry: ScheduleEntry
): Promise<void> {
  const entries = await loadAll(kv);
  entries[entry.id] = entry;
  await saveAll(kv, entries);
}

export async function deleteSchedule(
  kv: KVNamespace,
  id: string
): Promise<boolean> {
  const entries = await loadAll(kv);
  if (!entries[id]) return false;
  delete entries[id];
  await saveAll(kv, entries);
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
  const entries = await loadAll(kv);
  const existing = entries[id];
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

  entries[id] = updated;
  await saveAll(kv, entries);
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
