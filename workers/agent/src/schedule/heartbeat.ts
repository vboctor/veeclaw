import type { ScheduleEntry } from "@veeclaw/shared";
import { CronExpressionParser } from "cron-parser";
import type { Env } from "../index.ts";
import { dispatchScheduleEntry } from "./dispatch.ts";
import { loadAll, saveAll, getNextRun } from "./store.ts";

export async function runHeartbeat(env: Env): Promise<void> {
  const now = Date.now();

  // Fast path: 1 read to check if anything is due
  const nextRun = await getNextRun(env.AGENT_KV);
  if (nextRun !== null && nextRun > now) return;

  // Something may be due (or no sentinel yet) — do full scan
  const entries = await loadAll(env.AGENT_KV);
  const ids = Object.keys(entries);
  if (ids.length === 0) return;

  // Find due entries
  const due = ids
    .map((id) => entries[id])
    .filter(
      (e) =>
        e.nextRun <= now &&
        isWithinActiveHours(e, now) &&
        !hasReachedMaxRuns(e)
    );

  if (due.length === 0) return;

  console.log(`[agent:heartbeat] ${due.length} entries due, dispatching...`);

  // Dispatch all due entries
  const results = await Promise.all(
    due.map(async (entry) => ({
      entry,
      ok: (await dispatchScheduleEntry(entry, env)).ok,
    }))
  );

  // Update entries in-place, then do a single KV write
  let changed = false;
  for (const { entry, ok } of results) {
    const newRunCount = entry.runCount + 1;

    if (entry.type === "one-shot") {
      delete entries[entry.id];
      changed = true;
      continue;
    }

    if (entry.maxRuns !== undefined && newRunCount >= entry.maxRuns) {
      console.log(`[agent:heartbeat] ${entry.id} reached maxRuns (${entry.maxRuns}), removing`);
      delete entries[entry.id];
      changed = true;
      continue;
    }

    if (entry.cron) {
      entries[entry.id] = {
        ...entry,
        nextRun: computeNextRun(entry.cron, now),
        lastRun: now,
        lastRunStatus: ok ? "success" : "failure",
        runCount: newRunCount,
        successCount: (entry.successCount ?? 0) + (ok ? 1 : 0),
        failureCount: (entry.failureCount ?? 0) + (ok ? 0 : 1),
      };
      changed = true;
    }
  }

  if (changed) {
    await saveAll(env.AGENT_KV, entries);
  }
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
