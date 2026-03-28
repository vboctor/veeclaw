import type { ScheduleEntry } from "@scaf/shared";
import { SCHEDULE_PREFIX } from "@scaf/shared";
import { CronExpressionParser } from "cron-parser";
import type { Env } from "../index.ts";
import { dispatchScheduleEntry } from "./dispatch.ts";

export async function runHeartbeat(env: Env): Promise<void> {
  const now = Date.now();

  const list = await env.AGENT_KV.list({ prefix: SCHEDULE_PREFIX });
  if (list.keys.length === 0) return;

  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const raw = await env.AGENT_KV.get(k.name);
      return raw ? (JSON.parse(raw) as ScheduleEntry) : null;
    })
  );

  // Fire any entry whose nextRun is at or before now (catches missed one-shots too)
  const due = entries.filter(
    (e): e is ScheduleEntry =>
      e !== null &&
      e.nextRun <= now &&
      isWithinActiveHours(e, now) &&
      !hasReachedMaxRuns(e)
  );

  if (due.length === 0) return;

  console.log(`[agent:heartbeat] ${due.length} entries due, dispatching...`);
  await Promise.all(due.map((entry) => dispatch(entry, now, env)));
}

async function dispatch(
  entry: ScheduleEntry,
  now: number,
  env: Env
): Promise<void> {
  const result = await dispatchScheduleEntry(entry, env);
  const success = result.ok;

  const newRunCount = entry.runCount + 1;
  const newSuccessCount = (entry.successCount ?? 0) + (success ? 1 : 0);
  const newFailureCount = (entry.failureCount ?? 0) + (success ? 0 : 1);

  // One-shot entries are always deleted after firing
  if (entry.type === "one-shot") {
    await env.AGENT_KV.delete(`${SCHEDULE_PREFIX}${entry.id}`);
    return;
  }

  // Recurring: check if maxRuns reached after this run
  if (entry.maxRuns !== undefined && newRunCount >= entry.maxRuns) {
    console.log(`[agent:heartbeat] ${entry.id} reached maxRuns (${entry.maxRuns}), removing`);
    await env.AGENT_KV.delete(`${SCHEDULE_PREFIX}${entry.id}`);
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
    await env.AGENT_KV.put(
      `${SCHEDULE_PREFIX}${entry.id}`,
      JSON.stringify(updated)
    );
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
