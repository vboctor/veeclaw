#!/usr/bin/env bun
/**
 * VeeClaw Undeploy — tears down all Cloudflare resources and local config.
 *
 * Deletes: Telegram webhook, all 3 workers, KV namespace, local .dev.vars files.
 * Does NOT delete .env (so you can re-run setup easily).
 *
 * Usage:
 *   bun run undeploy
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir.replace(/\/scripts$/, "");

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(tag: "DELETE" | "SKIP" | "OK" | "WARN" | "INFO", msg: string) {
  const colors: Record<string, string> = {
    DELETE: "\x1b[31m", // red
    SKIP: "\x1b[90m",   // gray
    OK: "\x1b[32m",     // green
    WARN: "\x1b[33m",   // yellow
    INFO: "\x1b[36m",   // cyan
  };
  console.log(`${colors[tag]}[${tag}]\x1b[0m ${msg}`);
}

function header(title: string) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m\n`);
}

async function run(cmd: string[], opts?: { stdin?: string; cwd?: string }): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts?.cwd ?? ROOT,
    stdin: opts?.stdin ? new Response(opts.stdin).body! : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() };
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const vars: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (val) vars[key] = val;
  }
  return vars;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1m\x1b[31m");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║     VeeClaw Undeploy / Teardown     ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("\x1b[0m");

  console.log("  This will delete:");
  console.log("    - Telegram webhook");
  console.log("    - All 6 Cloudflare Workers");
  console.log("    - KV namespaces (AGENT_KV, TOOL_CACHE)");
  console.log("    - Local .dev.vars files");
  console.log("  ");
  console.log("  Your .env file will NOT be deleted.\n");

  const confirm = prompt("Type 'yes' to proceed:");
  if (confirm !== "yes") {
    console.log("Aborted.");
    process.exit(0);
  }

  // ── Step 1: Remove Telegram webhook ──────────────────────────────────────

  header("Telegram Webhook");

  const envVars = parseEnvFile(join(ROOT, ".env"));
  const token = envVars.TELEGRAM_BOT_TOKEN;

  if (token) {
    const resp = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const result = (await resp.json()) as { ok: boolean; description?: string };
    if (result.ok) {
      log("DELETE", "Telegram webhook removed");
    } else {
      log("WARN", `Failed to remove webhook: ${result.description}`);
    }
  } else {
    log("SKIP", "No TELEGRAM_BOT_TOKEN in .env — skipping webhook removal");
  }

  // ── Step 2: Delete workers ───────────────────────────────────────────────

  header("Workers");

  const workers = [
    "veeclaw-telegram-gateway",
    "veeclaw-agent",
    "veeclaw-mantishub-connector",
    "veeclaw-github-connector",
    "veeclaw-google-connector",
    "veeclaw-llm-gateway",
  ];

  for (const name of workers) {
    log("INFO", `Deleting ${name}...`);
    const result = await run(["bun", "x", "wrangler", "delete", "--name", name, "--force"]);
    if (result.ok) {
      log("DELETE", name);
    } else if (result.stderr.includes("not found") || result.stdout.includes("not found")) {
      log("SKIP", `${name} (not deployed)`);
    } else {
      log("WARN", `Failed to delete ${name}: ${result.stderr || result.stdout}`);
    }
  }

  // ── Step 3: Delete KV namespace ──────────────────────────────────────────

  header("KV Namespace");

  const wranglerPath = join(ROOT, "workers/agent/wrangler.jsonc");
  const wranglerContent = readFileSync(wranglerPath, "utf-8");
  const idMatch = wranglerContent.match(/"binding":\s*"AGENT_KV",\s*"id":\s*"([^"]*)"/);
  const kvId = idMatch?.[1];

  if (kvId) {
    const result = await run(["bun", "x", "wrangler", "kv", "namespace", "delete", "--namespace-id", kvId]);
    if (result.ok) {
      log("DELETE", `KV namespace AGENT_KV (${kvId})`);
    } else if (result.stderr.includes("not found") || result.stdout.includes("not found")) {
      log("SKIP", `KV namespace ${kvId} (not found)`);
    } else {
      log("WARN", `Failed to delete KV namespace: ${result.stderr || result.stdout}`);
    }
  } else {
    log("SKIP", "No AGENT_KV namespace ID found in wrangler.jsonc");
  }

  // Delete TOOL_CACHE KV (Google Connector)
  const googleWranglerPath = join(ROOT, "workers/connectors/google/wrangler.jsonc");
  if (existsSync(googleWranglerPath)) {
    const googleWranglerContent = readFileSync(googleWranglerPath, "utf-8");
    const googleIdMatch = googleWranglerContent.match(/"binding":\s*"TOOL_CACHE",\s*"id":\s*"([^"]*)"/);
    const googleKvId = googleIdMatch?.[1];

    if (googleKvId) {
      const result = await run(["bun", "x", "wrangler", "kv", "namespace", "delete", "--namespace-id", googleKvId]);
      if (result.ok) {
        log("DELETE", `KV namespace TOOL_CACHE (${googleKvId})`);
      } else if (result.stderr.includes("not found") || result.stdout.includes("not found")) {
        log("SKIP", `KV namespace ${googleKvId} (not found)`);
      } else {
        log("WARN", `Failed to delete TOOL_CACHE KV namespace: ${result.stderr || result.stdout}`);
      }
    } else {
      log("SKIP", "No TOOL_CACHE namespace ID found in google connector wrangler.jsonc");
    }
  }

  // Delete CONNECTOR_KV (MantisHub Connector)
  const mantishubWranglerPath = join(ROOT, "workers/connectors/mantishub/wrangler.jsonc");
  if (existsSync(mantishubWranglerPath)) {
    const mantishubWranglerContent = readFileSync(mantishubWranglerPath, "utf-8");
    const mantishubIdMatch = mantishubWranglerContent.match(/"binding":\s*"CONNECTOR_KV",\s*"id":\s*"([^"]*)"/);
    const mantishubKvId = mantishubIdMatch?.[1];

    if (mantishubKvId) {
      const result = await run(["bun", "x", "wrangler", "kv", "namespace", "delete", "--namespace-id", mantishubKvId]);
      if (result.ok) {
        log("DELETE", `KV namespace CONNECTOR_KV (${mantishubKvId})`);
      } else if (result.stderr.includes("not found") || result.stdout.includes("not found")) {
        log("SKIP", `KV namespace ${mantishubKvId} (not found)`);
      } else {
        log("WARN", `Failed to delete CONNECTOR_KV namespace: ${result.stderr || result.stdout}`);
      }
    } else {
      log("SKIP", "No CONNECTOR_KV namespace ID found in mantishub connector wrangler.jsonc");
    }
  }

  // ── Step 4: Clean local .dev.vars files ──────────────────────────────────

  header("Local Files");

  const devVarsPaths = [
    "workers/llm-gateway/.dev.vars",
    "workers/connectors/google/.dev.vars",
    "workers/connectors/github/.dev.vars",
    "workers/connectors/mantishub/.dev.vars",
    "workers/agent/.dev.vars",
    "workers/telegram-gateway/.dev.vars",
  ];

  for (const rel of devVarsPaths) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) {
      unlinkSync(abs);
      log("DELETE", rel);
    } else {
      log("SKIP", `${rel} (not found)`);
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  header("Done");
  console.log("  All Cloudflare resources have been torn down.");
  console.log("  Your .env file is preserved — run 'bun run setup' to redeploy.\n");
}

main().catch((err) => {
  console.error("\x1b[31mUndeploy failed:\x1b[0m", err);
  process.exit(1);
});
