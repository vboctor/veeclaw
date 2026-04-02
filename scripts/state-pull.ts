#!/usr/bin/env bun
/**
 * Pull agent state (memory + schedules) to local `state/` directory.
 *
 * Usage:
 *   bun run pull           # pull everything
 *   bun run pull memory    # pull memory only
 *   bun run pull schedules # pull schedules only
 *
 * Reads AGENT_TOKEN from .env (auto-loaded by Bun).
 * Reads AGENT_URL from .env, falling back to the default workers.dev URL.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

async function pullMemory(): Promise<void> {
  const url = getAgentUrl();
  console.log("Pulling memory...");

  const res = await fetch(`${url}/v1/memory`, { headers: headers() });
  if (!res.ok) {
    console.error(`Failed to pull memory: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const data = (await res.json()) as {
    working: unknown[];
    summary: string;
    facts: string;
  };

  mkdirSync(MEMORY_DIR, { recursive: true });

  writeFileSync(join(MEMORY_DIR, "facts.md"), data.facts || "", "utf-8");
  writeFileSync(join(MEMORY_DIR, "summary.md"), data.summary || "", "utf-8");
  writeFileSync(
    join(MEMORY_DIR, "working.json"),
    JSON.stringify(data.working || [], null, 2) + "\n",
    "utf-8"
  );

  console.log(`  facts.md    (${data.facts?.length ?? 0} chars)`);
  console.log(`  summary.md  (${data.summary?.length ?? 0} chars)`);
  console.log(`  working.json (${data.working?.length ?? 0} messages)`);
}

async function pullSchedules(): Promise<void> {
  const url = getAgentUrl();
  console.log("Pulling schedules...");

  const res = await fetch(`${url}/v1/schedules`, { headers: headers() });
  if (!res.ok) {
    console.error(
      `Failed to pull schedules: ${res.status} ${await res.text()}`
    );
    process.exit(1);
  }

  const entries = (await res.json()) as unknown[];

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(
    join(STATE_DIR, "schedules.json"),
    JSON.stringify(entries, null, 2) + "\n",
    "utf-8"
  );

  console.log(`  schedules.json (${entries.length} entries)`);
}

// ── Main ─────────────────────────────────────────────────────────

const target = process.argv[2]; // "memory", "schedules", or undefined (all)

if (!target || target === "memory") await pullMemory();
if (!target || target === "schedules") await pullSchedules();

console.log("\nDone. State saved to state/");
