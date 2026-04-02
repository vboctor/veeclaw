#!/usr/bin/env bun
/**
 * Push local `state/` directory back to the agent worker (memory + schedules).
 *
 * Usage:
 *   bun run push           # push everything
 *   bun run push memory    # push memory only
 *   bun run push schedules # push schedules only
 *
 * Reads AGENT_TOKEN from .env (auto-loaded by Bun).
 * Reads AGENT_URL from .env, falling back to the default workers.dev URL.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScheduleEntry } from "@veeclaw/shared";

const ROOT = import.meta.dir.replace(/\/scripts$/, "");
const STATE_DIR = join(ROOT, "state");
const MEMORY_DIR = join(STATE_DIR, "memory");

const DEFAULT_AGENT_URL = "https://veeclaw-agent.vboctor.workers.dev";

function getAgentUrl(): string {
  return (process.env.AGENT_URL ?? DEFAULT_AGENT_URL).replace(/\/$/, "");
}

function getAgentToken(): string {
  const token = process.env.AGENT_TOKEN;
  if (!token) {
    console.error("AGENT_TOKEN not set in .env. Run `bun run setup` first.");
    process.exit(1);
  }
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getAgentToken()}`,
    "Content-Type": "application/json",
  };
}

function readLocal(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

async function pushMemory(): Promise<void> {
  const factsPath = join(MEMORY_DIR, "facts.md");
  const summaryPath = join(MEMORY_DIR, "summary.md");
  const workingPath = join(MEMORY_DIR, "working.json");

  if (!existsSync(MEMORY_DIR)) {
    console.error("No state/memory/ directory. Run `bun run pull` first.");
    process.exit(1);
  }

  const facts = readLocal(factsPath);
  const summary = readLocal(summaryPath);
  const workingRaw = readLocal(workingPath);
  const working = workingRaw ? JSON.parse(workingRaw) : [];

  console.log("Pushing memory...");
  console.log(`  facts.md    (${facts.length} chars)`);
  console.log(`  summary.md  (${summary.length} chars)`);
  console.log(`  working.json (${working.length} messages)`);

  const url = getAgentUrl();
  const res = await fetch(`${url}/v1/memory`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ working, summary, facts }),
  });

  if (!res.ok) {
    console.error(`Failed to push memory: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
}

async function pushSchedules(): Promise<void> {
  const schedulesPath = join(STATE_DIR, "schedules.json");
  if (!existsSync(schedulesPath)) {
    console.error("No state/schedules.json. Run `bun run pull` first.");
    process.exit(1);
  }

  const entries = JSON.parse(
    readFileSync(schedulesPath, "utf-8")
  ) as ScheduleEntry[];

  console.log(`Pushing schedules (${entries.length} entries)...`);

  const url = getAgentUrl();
  const hdrs = headers();

  // Pull current remote schedules to compute diff
  const remoteRes = await fetch(`${url}/v1/schedules`, { headers: hdrs });
  if (!remoteRes.ok) {
    console.error(
      `Failed to fetch remote schedules: ${remoteRes.status} ${await remoteRes.text()}`
    );
    process.exit(1);
  }
  const remote = (await remoteRes.json()) as ScheduleEntry[];
  const remoteIds = new Set(remote.map((e) => e.id));
  const localIds = new Set(entries.map((e) => e.id));

  // Delete remote entries not in local
  for (const id of remoteIds) {
    if (!localIds.has(id)) {
      const res = await fetch(`${url}/v1/schedules/${id}`, {
        method: "DELETE",
        headers: hdrs,
      });
      console.log(`  deleted: ${id} (${res.status})`);
    }
  }

  // Upsert local entries
  for (const entry of entries) {
    if (remoteIds.has(entry.id)) {
      const res = await fetch(`${url}/v1/schedules/${entry.id}`, {
        method: "PUT",
        headers: hdrs,
        body: JSON.stringify({
          label: entry.label,
          cron: entry.cron,
          content:
            entry.mode === "prompt" ? entry.event?.content : undefined,
          maxRuns: entry.maxRuns,
          activeHours: entry.activeHours,
        }),
      });
      console.log(`  updated: ${entry.id} (${res.status})`);
    } else {
      const res = await fetch(`${url}/v1/schedules`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({ entry }),
      });
      console.log(`  created: ${entry.id} (${res.status})`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────

const target = process.argv[2]; // "memory", "schedules", or undefined (all)

if (!target || target === "memory") await pushMemory();
if (!target || target === "schedules") await pushSchedules();

console.log("\nDone. State pushed to agent worker.");
