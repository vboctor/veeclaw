#!/usr/bin/env bun
/**
 * MantisHub Auth Setup — manages multiple named MantisHub instances.
 *
 * Usage: bun run mantishub-auth
 *
 * Stores instance configs (name, subdomain, token) in .env as JSON.
 * The setup script pushes these to the connector's KV namespace.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import * as readline from "readline";

const ENV_FILE = resolve(import.meta.dir, "../.env");

interface MantisHubInstance {
  name: string;
  subdomain: string;
  baseUrl: string;
  token: string;
  default: boolean;
}

function readEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return env;
  for (const line of readFileSync(ENV_FILE, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return env;
}

function writeEnvKey(key: string, value: string): void {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    if (content && !content.endsWith("\n")) content += "\n";
    content += `${key}=${value}\n`;
  }

  writeFileSync(ENV_FILE, content);
}

function getInstances(): MantisHubInstance[] {
  const env = readEnv();
  const raw = env.MANTISHUB_INSTANCES;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MantisHubInstance[];
  } catch {
    return [];
  }
}

function saveInstances(instances: MantisHubInstance[]): void {
  writeEnvKey("MANTISHUB_INSTANCES", JSON.stringify(instances));
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function validateInstance(
  baseUrl: string,
  token: string,
): Promise<{ valid: boolean; user?: string; error?: string }> {
  try {
    const res = await fetch(
      `${baseUrl}/api/rest/plugins/ApiX/discover`,
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return { valid: false, error: `HTTP ${res.status}: ${body}` };
    }

    const data = (await res.json()) as {
      user?: { name?: string };
      instance?: { name?: string };
    };
    const user = data.user?.name || "unknown";
    return { valid: true, user };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function addInstance(): Promise<void> {
  const instances = getInstances();

  const name = await prompt("Instance name (e.g., 'tasks', 'bugs'): ");
  if (!name) {
    console.log("No name provided. Aborting.");
    return;
  }

  if (instances.find((i) => i.name === name)) {
    console.log(`Instance "${name}" already exists. Remove it first to re-add.`);
    return;
  }

  // If the name is a valid subdomain, offer it as the default URL
  const isValidSubdomain = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(name);
  const defaultUrl = isValidSubdomain ? `https://${name}.mantishub.io` : undefined;

  const urlInput = await prompt(
    defaultUrl
      ? `Base URL [${defaultUrl}]: `
      : "Base URL (e.g., https://tasks.mantishub.io): ",
  );

  let baseUrl = urlInput || defaultUrl;
  if (!baseUrl) {
    console.log("No URL provided. Aborting.");
    return;
  }

  // Normalize: strip trailing slash, ensure https://
  baseUrl = baseUrl.replace(/\/+$/, "");
  if (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://")) {
    baseUrl = `https://${baseUrl}`;
  }
  // If user typed just a subdomain like "tasks.mantishub.io", that's fine after adding https://

  const token = await prompt("API token: ");
  if (!token) {
    console.log("No token provided. Aborting.");
    return;
  }

  // Extract subdomain from baseUrl for display
  const subdomain = baseUrl.replace(/^https?:\/\//, "").replace(/\.mantishub\.io$/, "");

  console.log(`\nValidating against ${baseUrl}...`);
  const result = await validateInstance(baseUrl, token);

  if (!result.valid) {
    console.log(`\nValidation failed: ${result.error}`);
    return;
  }

  console.log(`Authenticated as: ${result.user}`);

  const isDefault = instances.length === 0;
  if (isDefault) {
    console.log("(Setting as default instance)");
  }

  instances.push({
    name,
    subdomain,
    baseUrl,
    token,
    default: isDefault,
  });

  saveInstances(instances);
  console.log(`\nInstance "${name}" added to .env`);
  console.log("Run `bun run setup` to push to Cloudflare KV.\n");
}

async function listInstances(): Promise<void> {
  const instances = getInstances();

  if (instances.length === 0) {
    console.log("No MantisHub instances configured.");
    return;
  }

  console.log("\nConfigured MantisHub instances:\n");
  for (const inst of instances) {
    const def = inst.default ? " (default)" : "";
    console.log(`  - ${inst.name}: ${inst.baseUrl}${def}`);
  }
  console.log();
}

async function removeInstance(): Promise<void> {
  const instances = getInstances();

  if (instances.length === 0) {
    console.log("No instances to remove.");
    return;
  }

  await listInstances();

  const name = await prompt("Instance name to remove: ");
  if (!name) return;

  const idx = instances.findIndex((i) => i.name === name);
  if (idx === -1) {
    console.log(`Instance "${name}" not found.`);
    return;
  }

  const wasDefault = instances[idx].default;
  instances.splice(idx, 1);

  // If we removed the default, make the first remaining instance the default
  if (wasDefault && instances.length > 0) {
    instances[0].default = true;
    console.log(`New default: ${instances[0].name}`);
  }

  saveInstances(instances);
  console.log(`Instance "${name}" removed.\n`);
}

async function setDefault(): Promise<void> {
  const instances = getInstances();

  if (instances.length === 0) {
    console.log("No instances configured.");
    return;
  }

  await listInstances();

  const name = await prompt("Set default to: ");
  if (!name) return;

  const target = instances.find((i) => i.name === name);
  if (!target) {
    console.log(`Instance "${name}" not found.`);
    return;
  }

  for (const inst of instances) {
    inst.default = inst.name === name;
  }

  saveInstances(instances);
  console.log(`Default set to "${name}".\n`);
}

async function main(): Promise<void> {
  console.log("\n  MantisHub Instance Manager\n");

  const action = await prompt(
    "Action (add/list/remove/default): ",
  );

  switch (action.toLowerCase()) {
    case "add":
    case "a":
      await addInstance();
      break;
    case "list":
    case "l":
      await listInstances();
      break;
    case "remove":
    case "r":
      await removeInstance();
      break;
    case "default":
    case "d":
      await setDefault();
      break;
    default:
      console.log("Unknown action. Use: add, list, remove, or default");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
