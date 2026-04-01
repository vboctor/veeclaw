#!/usr/bin/env bun
/**
 * Todoist Auth Setup — validates and saves a Todoist API token.
 *
 * Usage: bun run todoist-auth
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import * as readline from "readline";

const ENV_FILE = resolve(import.meta.dir, "../.env");

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

async function validateToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.todoist.com/api/v1/projects", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return { valid: false, error: `HTTP ${res.status}: ${body}` };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function main(): Promise<void> {
  console.log("\n  Todoist API Token Setup\n");
  console.log("To find your API token:");
  console.log("  1. Log in to Todoist");
  console.log("  2. Go to Settings → Integrations → Developer");
  console.log("  3. Copy your API token");
  console.log("  Or visit: https://app.todoist.com/prefs/integrations\n");

  const env = readEnv();
  const existing = env.TODOIST_TOKEN;

  if (existing) {
    console.log("Existing TODOIST_TOKEN found in .env");
    const result = await validateToken(existing);
    if (result.valid) {
      console.log("Token is valid.");
      const replace = await prompt("Replace with a new token? (y/N): ");
      if (replace.toLowerCase() !== "y") {
        console.log("\nKeeping existing token. Done!");
        return;
      }
    } else {
      console.log(`Existing token is invalid: ${result.error}`);
    }
  }

  const token = await prompt("Paste your Todoist API token: ");

  if (!token) {
    console.log("No token provided. Aborting.");
    process.exit(1);
  }

  console.log("\nValidating token...");
  const result = await validateToken(token);

  if (!result.valid) {
    console.log(`Token validation failed: ${result.error}`);
    process.exit(1);
  }

  console.log("Token is valid.");

  writeEnvKey("TODOIST_TOKEN", token);
  console.log(`\nTODOIST_TOKEN saved to .env`);
  console.log("\nNext steps:");
  console.log("  - Run `bun run setup` to push secrets and deploy workers");
  console.log("  - Or run `bun run dev:todoist` to test locally\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
