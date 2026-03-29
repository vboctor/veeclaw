#!/usr/bin/env bun
/**
 * SCAF Setup Wizard — incremental, idempotent setup for Cloudflare Workers.
 *
 * Usage:
 *   bun run setup            # interactive, skips what's already done
 *   bun run setup --force    # redo everything regardless of current state
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = import.meta.dir.replace(/\/scripts$/, "");
const ENV_FILE = join(ROOT, ".env");
const ENV_EXAMPLE = join(ROOT, ".env.example");
const FORCE = process.argv.includes("--force");

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(tag: "SKIP" | "CREATE" | "UPDATE" | "OK" | "WARN" | "INFO", msg: string) {
  const colors: Record<string, string> = {
    SKIP: "\x1b[90m",   // gray
    CREATE: "\x1b[32m", // green
    UPDATE: "\x1b[33m", // yellow
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

function promptUser(message: string, defaultValue?: string): string {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const result = prompt(`${message}${suffix}:`) ?? "";
  return result || defaultValue || "";
}

function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
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

function writeEnvFile(path: string, vars: Record<string, string>) {
  // Preserve the .env.example structure with comments, fill in values
  if (existsSync(ENV_EXAMPLE)) {
    const lines = readFileSync(ENV_EXAMPLE, "utf-8").split("\n");
    const output = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return line;
      const key = trimmed.slice(0, eq).trim();
      return vars[key] ? `${key}=${vars[key]}` : line;
    });
    writeFileSync(path, output.join("\n"));
  } else {
    const content = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
    writeFileSync(path, content);
  }
}

// ── Secret/Var definitions ───────────────────────────────────────────────────

const REQUIRED_SECRETS = ["OPENROUTER_API_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "AGENT_TOKEN"] as const;
const OPTIONAL_SECRETS = ["DEFAULT_CHAT_ID", "ALLOWED_CHAT_IDS"] as const;
const AUTO_GENERATE = ["TELEGRAM_WEBHOOK_SECRET", "AGENT_TOKEN"] as const;
const GOOGLE_SECRETS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"] as const;

const WORKER_SECRETS: Record<string, { required: string[]; optional: string[] }> = {
  "scaf-llm-gateway": {
    required: ["OPENROUTER_API_KEY"],
    optional: [],
  },
  "scaf-google-connector": {
    required: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
    optional: [],
  },
  "scaf-agent": {
    required: ["TELEGRAM_BOT_TOKEN", "AGENT_TOKEN"],
    optional: ["DEFAULT_CHAT_ID"],
  },
  "scaf-telegram-gateway": {
    required: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "AGENT_TOKEN"],
    optional: ["ALLOWED_CHAT_IDS"],
  },
};

const DEV_VARS: Record<string, string[]> = {
  "workers/llm-gateway": ["OPENROUTER_API_KEY"],
  "workers/connectors/google": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
  "workers/agent": ["TELEGRAM_BOT_TOKEN", "AGENT_TOKEN", "DEFAULT_CHAT_ID"],
  "workers/telegram-gateway": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "AGENT_TOKEN", "ALLOWED_CHAT_IDS"],
};

// ── Step 1: Prerequisites ────────────────────────────────────────────────────

async function checkPrerequisites(): Promise<boolean> {
  header("Prerequisites");

  const wrangler = await run(["bun", "x", "wrangler", "--version"]);
  if (!wrangler.ok) {
    log("WARN", "wrangler not found. Install with: bun add -g wrangler");
    return false;
  }
  log("OK", `wrangler ${wrangler.stdout}`);

  const whoami = await run(["bun", "x", "wrangler", "whoami"]);
  if (!whoami.ok || whoami.stdout.includes("not authenticated")) {
    log("WARN", "Not authenticated with Cloudflare. Run: bun x wrangler login");
    return false;
  }
  // Extract account info from output
  const accountLine = whoami.stdout.split("\n").find((l) => l.includes("Account"));
  if (accountLine) log("OK", accountLine.trim());
  else log("OK", "Authenticated with Cloudflare");

  return true;
}

// ── Step 2: Collect secrets ──────────────────────────────────────────────────

async function collectSecrets(): Promise<Record<string, string>> {
  header("Secrets");

  const existing = parseEnvFile(ENV_FILE);
  const vars = { ...existing };
  let changed = false;

  if (Object.keys(existing).length > 0) {
    log("INFO", `.env found with ${Object.keys(existing).length} value(s): ${Object.keys(existing).join(", ")}`);
  }

  for (const key of REQUIRED_SECRETS) {
    if (vars[key] && !FORCE) {
      log("SKIP", `${key} (already set)`);
      continue;
    }

    if ((AUTO_GENERATE as readonly string[]).includes(key)) {
      const choice = promptUser(`${key} — enter value or press Enter to auto-generate`);
      vars[key] = choice || generateToken();
      if (!choice) log("CREATE", `${key} = <auto-generated>`);
    } else {
      const val = promptUser(`${key}`);
      if (!val) {
        log("WARN", `${key} is required but was left empty — you can set it later in .env`);
        continue;
      }
      vars[key] = val;
    }
    changed = true;
  }

  for (const key of OPTIONAL_SECRETS) {
    if (vars[key] && !FORCE) {
      log("SKIP", `${key} (already set)`);
      continue;
    }

    if ((AUTO_GENERATE as readonly string[]).includes(key)) {
      const choice = promptUser(`${key} (optional) — enter value, press Enter to auto-generate, or type 'skip'`);
      if (choice === "skip" || choice === "s") continue;
      vars[key] = choice || generateToken();
      if (!choice) log("CREATE", `${key} = <auto-generated>`);
      changed = true;
    } else {
      const val = promptUser(`${key} (optional, press Enter to skip)`);
      if (!val) continue;
      vars[key] = val;
      changed = true;
    }
  }

  // Google Connector secrets
  for (const key of GOOGLE_SECRETS) {
    if (vars[key] && !FORCE) {
      log("SKIP", `${key} (already set)`);
      continue;
    }

    if (key === "GOOGLE_REFRESH_TOKEN") {
      if (!vars[key]) {
        log("INFO", `${key} not set — run 'bun run google-auth' to authorize with Google`);
      }
      continue;
    }

    const val = promptUser(`${key} (optional, press Enter to skip)`);
    if (!val) continue;
    vars[key] = val;
    changed = true;
  }

  if (changed) {
    writeEnvFile(ENV_FILE, vars);
    log("UPDATE", ".env updated");
  } else {
    log("SKIP", ".env unchanged");
  }

  return vars;
}

// ── Step 3: KV namespace ─────────────────────────────────────────────────────

async function ensureKVNamespace(): Promise<string | null> {
  header("KV Namespace");

  // Read current ID from wrangler.jsonc
  const wranglerPath = join(ROOT, "workers/agent/wrangler.jsonc");
  const wranglerContent = readFileSync(wranglerPath, "utf-8");
  const idMatch = wranglerContent.match(/"binding":\s*"AGENT_KV",\s*"id":\s*"([^"]*)"/);
  const currentId = idMatch?.[1] ?? "";

  // List existing KV namespaces
  const list = await run(["bun", "x", "wrangler", "kv", "namespace", "list"]);
  if (!list.ok) {
    log("WARN", `Failed to list KV namespaces: ${list.stderr}`);
    return null;
  }

  let namespaces: Array<{ id: string; title: string }> = [];
  try {
    namespaces = JSON.parse(list.stdout);
  } catch {
    log("WARN", `Failed to parse KV namespace list`);
    return null;
  }

  // Check if namespace with current ID already exists
  const existing = namespaces.find((ns) => ns.id === currentId);
  if (existing && !FORCE) {
    log("SKIP", `KV namespace exists: ${existing.title} (${existing.id})`);
    return existing.id;
  }

  // Check if any namespace with a matching title exists
  const byTitle = namespaces.find((ns) => ns.title.includes("AGENT_KV") || ns.title.includes("MEMORY_KV"));
  if (byTitle && !FORCE) {
    log("OK", `Found existing KV namespace: ${byTitle.title} (${byTitle.id})`);
    if (byTitle.id !== currentId) {
      // Update wrangler.jsonc with the found ID
      const updated = wranglerContent.replace(
        /("binding":\s*"AGENT_KV",\s*"id":\s*")[^"]*/,
        `$1${byTitle.id}`
      );
      writeFileSync(wranglerPath, updated);
      log("UPDATE", `wrangler.jsonc updated with KV ID: ${byTitle.id}`);
    }
    return byTitle.id;
  }

  // Create new namespace
  const create = await run(["bun", "x", "wrangler", "kv", "namespace", "create", "AGENT_KV"]);
  if (!create.ok) {
    log("WARN", `Failed to create KV namespace: ${create.stderr}`);
    return null;
  }

  // Parse the ID from output — wrangler prints JSON or a message like: { id: "..." }
  const newIdMatch = create.stdout.match(/"id":\s*"([^"]+)"/);
  if (!newIdMatch) {
    log("WARN", `Could not parse KV namespace ID from output:\n${create.stdout}`);
    return null;
  }

  const newId = newIdMatch[1];
  const updated = wranglerContent.replace(
    /("binding":\s*"AGENT_KV",\s*"id":\s*")[^"]*/,
    `$1${newId}`
  );
  writeFileSync(wranglerPath, updated);
  log("CREATE", `KV namespace created (${newId}) and wrangler.jsonc updated`);
  return newId;
}

// ── Step 3b: Google Connector KV namespace ──────────────────────────────────

async function ensureGoogleKVNamespace(): Promise<string | null> {
  header("Google Connector KV Namespace");

  const wranglerPath = join(ROOT, "workers/connectors/google/wrangler.jsonc");
  const wranglerContent = readFileSync(wranglerPath, "utf-8");
  const idMatch = wranglerContent.match(/"binding":\s*"TOOL_CACHE",\s*"id":\s*"([^"]*)"/);
  const currentId = idMatch?.[1] ?? "";

  const list = await run(["bun", "x", "wrangler", "kv", "namespace", "list"]);
  if (!list.ok) {
    log("WARN", `Failed to list KV namespaces: ${list.stderr}`);
    return null;
  }

  let namespaces: Array<{ id: string; title: string }> = [];
  try {
    namespaces = JSON.parse(list.stdout);
  } catch {
    log("WARN", "Failed to parse KV namespace list");
    return null;
  }

  const existing = namespaces.find((ns) => ns.id === currentId);
  if (existing && !FORCE) {
    log("SKIP", `KV namespace exists: ${existing.title} (${existing.id})`);
    return existing.id;
  }

  const byTitle = namespaces.find((ns) => ns.title.includes("TOOL_CACHE"));
  if (byTitle && !FORCE) {
    log("OK", `Found existing KV namespace: ${byTitle.title} (${byTitle.id})`);
    if (byTitle.id !== currentId) {
      const updated = wranglerContent.replace(
        /("binding":\s*"TOOL_CACHE",\s*"id":\s*")[^"]*/,
        `$1${byTitle.id}`,
      );
      writeFileSync(wranglerPath, updated);
      log("UPDATE", `wrangler.jsonc updated with KV ID: ${byTitle.id}`);
    }
    return byTitle.id;
  }

  const create = await run(["bun", "x", "wrangler", "kv", "namespace", "create", "TOOL_CACHE"]);
  if (!create.ok) {
    log("WARN", `Failed to create KV namespace: ${create.stderr}`);
    return null;
  }

  const newIdMatch = create.stdout.match(/"id":\s*"([^"]+)"/);
  if (!newIdMatch) {
    log("WARN", `Could not parse KV namespace ID from output:\n${create.stdout}`);
    return null;
  }

  const newId = newIdMatch[1];
  const updated = wranglerContent.replace(
    /("binding":\s*"TOOL_CACHE",\s*"id":\s*")[^"]*/,
    `$1${newId}`,
  );
  writeFileSync(wranglerPath, updated);
  log("CREATE", `KV namespace created (${newId}) and wrangler.jsonc updated`);
  return newId;
}

// ── Step 4: Generate .dev.vars ───────────────────────────────────────────────

function generateDevVars(vars: Record<string, string>) {
  header("Local .dev.vars");

  for (const [workerDir, keys] of Object.entries(DEV_VARS)) {
    const lines: string[] = [];
    for (const key of keys) {
      if (vars[key]) lines.push(`${key}=${vars[key]}`);
    }
    const devVarsPath = join(ROOT, workerDir, ".dev.vars");
    writeFileSync(devVarsPath, lines.join("\n") + "\n");
    log("CREATE", `${workerDir}/.dev.vars (${lines.length} values)`);
  }
}

// ── Step 5: Deploy workers ───────────────────────────────────────────────────

async function deployWorkers(): Promise<{ telegramUrl?: string }> {
  header("Deploy Workers");

  const workers = [
    { name: "scaf-llm-gateway", dir: "workers/llm-gateway" },
    { name: "scaf-google-connector", dir: "workers/connectors/google" },
    { name: "scaf-agent", dir: "workers/agent" },
    { name: "scaf-telegram-gateway", dir: "workers/telegram-gateway" },
  ];

  let telegramUrl: string | undefined;

  for (const { name, dir } of workers) {
    log("INFO", `Deploying ${name}...`);
    const result = await run(["bun", "x", "wrangler", "deploy"], { cwd: join(ROOT, dir) });
    if (result.ok) {
      const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.workers\.dev/);
      log("OK", `${name} deployed${urlMatch ? ` → ${urlMatch[0]}` : ""}`);
      if (name === "scaf-telegram-gateway" && urlMatch) {
        telegramUrl = urlMatch[0];
      }
    } else {
      log("WARN", `${name} deploy failed: ${result.stderr || result.stdout}`);
    }
  }

  return { telegramUrl };
}

// ── Step 6: Push secrets to Cloudflare ───────────────────────────────────────

async function pushSecrets(vars: Record<string, string>) {
  header("Cloudflare Secrets");

  for (const [workerName, config] of Object.entries(WORKER_SECRETS)) {
    // Get existing secrets
    const list = await run(["bun", "x", "wrangler", "secret", "list", "--name", workerName]);
    let existingSecrets: string[] = [];
    if (list.ok) {
      try {
        const parsed = JSON.parse(list.stdout) as Array<{ name: string }>;
        existingSecrets = parsed.map((s) => s.name);
      } catch { /* empty */ }
    }

    const allKeys = [...config.required, ...config.optional];
    for (const key of allKeys) {
      if (!vars[key]) continue;

      if (existingSecrets.includes(key) && !FORCE) {
        log("SKIP", `${workerName}: ${key} (already set)`);
        continue;
      }

      const result = await run(
        ["bun", "x", "wrangler", "secret", "put", key, "--name", workerName],
        { stdin: vars[key] }
      );
      if (result.ok) {
        log(existingSecrets.includes(key) ? "UPDATE" : "CREATE", `${workerName}: ${key}`);
      } else {
        log("WARN", `${workerName}: failed to set ${key} — ${result.stderr}`);
      }
    }
  }
}

// ── Step 7: Register Telegram webhook ────────────────────────────────────────

async function registerWebhook(vars: Record<string, string>, telegramUrl?: string) {
  header("Telegram Webhook");

  const token = vars.TELEGRAM_BOT_TOKEN;
  const secret = vars.TELEGRAM_WEBHOOK_SECRET;
  if (!token) {
    log("WARN", "TELEGRAM_BOT_TOKEN not set — skipping webhook registration");
    return;
  }

  if (!telegramUrl) {
    // Try to get the URL from the existing webhook or ask the user
    const infoResp = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const info = (await infoResp.json()) as { ok: boolean; result: { url: string } };
    if (info.ok && info.result.url) {
      telegramUrl = info.result.url;
      log("INFO", `Using existing webhook URL: ${telegramUrl}`);
    } else {
      telegramUrl = promptUser("Telegram gateway worker URL (e.g. https://scaf-telegram-gateway.yourname.workers.dev)");
      if (!telegramUrl) {
        log("WARN", "No URL provided — skipping webhook registration");
        return;
      }
    }
  }

  // Always re-register the webhook because Telegram doesn't expose whether
  // secret_token is set in getWebhookInfo, so we can't detect a mismatch.
  // setWebhook is idempotent and cheap.
  const body: Record<string, string> = { url: telegramUrl };
  if (secret) body.secret_token = secret;

  const setResp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const setResult = (await setResp.json()) as { ok: boolean; description?: string };

  if (setResult.ok) {
    log("CREATE", `Webhook registered → ${telegramUrl}`);
  } else {
    log("WARN", `Failed to set webhook: ${setResult.description}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1m\x1b[36m");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║        SCAF Setup Wizard          ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("\x1b[0m");

  if (FORCE) log("INFO", "Running in --force mode (redo everything)");

  const ok = await checkPrerequisites();
  if (!ok) {
    console.log("\nFix the above issues and re-run: bun run setup");
    process.exit(1);
  }

  const vars = await collectSecrets();
  await ensureKVNamespace();
  await ensureGoogleKVNamespace();
  generateDevVars(vars);
  const { telegramUrl } = await deployWorkers();
  await pushSecrets(vars);
  await registerWebhook(vars, telegramUrl);

  header("Done");
  console.log("  Your SCAF environment is ready!");
  console.log("  - Local dev:  bun run dev:agent / dev:gateway / dev:telegram");
  console.log("  - CLI:        bun run start");
  console.log("  - Re-run this wizard any time: bun run setup");
  console.log("  - Tear down everything:        bun run undeploy\n");
}

main().catch((err) => {
  console.error("\x1b[31mSetup failed:\x1b[0m", err);
  process.exit(1);
});
