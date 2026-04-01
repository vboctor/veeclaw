#!/usr/bin/env bun
/**
 * GitHub Auth Setup — validates and saves a GitHub Personal Access Token.
 *
 * Usage: bun run github-auth
 *
 * Unlike Google OAuth, GitHub PATs are created manually at github.com/settings/tokens.
 * This script prompts for the token, validates it, and saves it to .env.
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
): Promise<{ valid: boolean; login?: string; error?: string }> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VeeClaw/1.0",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      return { valid: false, error: `HTTP ${res.status}: ${body}` };
    }

    const data = (await res.json()) as { login: string };
    return { valid: true, login: data.login };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function main(): Promise<void> {
  console.log("\n🔑 GitHub Personal Access Token Setup\n");
  console.log("This script saves a GitHub PAT for VeeClaw to access your repositories.\n");
  console.log("To create a token:");
  console.log("  1. Go to https://github.com/settings/tokens?type=beta");
  console.log("  2. Click 'Generate new token'");
  console.log("  3. Give it a name (e.g., 'VeeClaw')");
  console.log("  4. Set expiration as desired");
  console.log("  5. Select repositories: 'All repositories' or specific ones");
  console.log("  6. Under 'Permissions', grant:");
  console.log("     - Repository permissions:");
  console.log("       - Contents: Read");
  console.log("       - Issues: Read and write");
  console.log("       - Pull requests: Read and write");
  console.log("       - Metadata: Read (auto-selected)");
  console.log("     - Organization permissions:");
  console.log("       - Members: Read");
  console.log("  7. Click 'Generate token' and copy it\n");

  const env = readEnv();
  const existing = env.GITHUB_TOKEN;

  if (existing) {
    console.log("Existing GITHUB_TOKEN found in .env");
    const result = await validateToken(existing);
    if (result.valid) {
      console.log(`✅ Token is valid (authenticated as @${result.login})`);
      const replace = await prompt("Replace with a new token? (y/N): ");
      if (replace.toLowerCase() !== "y") {
        console.log("\nKeeping existing token. Done!");
        return;
      }
    } else {
      console.log(`⚠️  Existing token is invalid: ${result.error}`);
    }
  }

  const token = await prompt("Paste your GitHub Personal Access Token: ");

  if (!token) {
    console.log("No token provided. Aborting.");
    process.exit(1);
  }

  console.log("\nValidating token...");
  const result = await validateToken(token);

  if (!result.valid) {
    console.log(`❌ Token validation failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`✅ Authenticated as @${result.login}`);

  writeEnvKey("GITHUB_TOKEN", token);
  console.log(`\n✅ GITHUB_TOKEN saved to .env`);
  console.log("\nNext steps:");
  console.log("  • Run `bun run setup` to push secrets and deploy workers");
  console.log("  • Or run `bun run dev:github` to test locally\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
