#!/usr/bin/env bun
/**
 * Google OAuth2 Authorization — opens browser for consent, exchanges code for
 * a refresh token, and writes it to .env.
 *
 * Prerequisites:
 *   1. Create a Google Cloud project and enable Gmail, Calendar, and Drive APIs
 *   2. Create an OAuth 2.0 "Desktop app" client ID
 *   3. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 *
 * Usage:
 *   bun run google-auth
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = import.meta.dir.replace(/\/scripts$/, "");
const ENV_FILE = join(ROOT, ".env");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const REDIRECT_PORT = 8976;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(tag: "OK" | "INFO" | "WARN" | "ERROR", msg: string) {
  const colors: Record<string, string> = {
    OK: "\x1b[32m",
    INFO: "\x1b[36m",
    WARN: "\x1b[33m",
    ERROR: "\x1b[31m",
  };
  console.log(`${colors[tag]}[${tag}]\x1b[0m ${msg}`);
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

function updateEnvFile(path: string, key: string, value: string) {
  if (!existsSync(path)) {
    writeFileSync(path, `${key}=${value}\n`);
    return;
  }

  const content = readFileSync(path, "utf-8");
  const lines = content.split("\n");
  let found = false;

  const updated = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) return line;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return line;
    const k = trimmed.slice(0, eq).trim();
    if (k === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    // Add after the last non-empty line, or append a Google section
    const hasGoogleSection = content.includes("Google Connector");
    if (!hasGoogleSection) {
      updated.push("");
      updated.push("# === Google Connector ===");
    }
    updated.push(`${key}=${value}`);
  }

  writeFileSync(path, updated.join("\n"));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\x1b[1m\x1b[36m");
  console.log("  ╔═══════════════════════════════════╗");
  console.log("  ║     Google OAuth2 Authorization    ║");
  console.log("  ╚═══════════════════════════════════╝");
  console.log("\x1b[0m");

  const env = parseEnvFile(ENV_FILE);

  const clientId = env.GOOGLE_CLIENT_ID || prompt("GOOGLE_CLIENT_ID:") || "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET || prompt("GOOGLE_CLIENT_SECRET:") || "";

  if (!clientId || !clientSecret) {
    log("ERROR", "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.");
    log("INFO", "Set them in .env or enter them above.");
    process.exit(1);
  }

  // Save client ID/secret to .env if not already there
  if (!env.GOOGLE_CLIENT_ID) updateEnvFile(ENV_FILE, "GOOGLE_CLIENT_ID", clientId);
  if (!env.GOOGLE_CLIENT_SECRET) updateEnvFile(ENV_FILE, "GOOGLE_CLIENT_SECRET", clientSecret);

  // Build authorization URL
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  // Start local server and wait for callback
  const { promise: codePromise, resolve: resolveCode, reject: rejectCode } =
    Promise.withResolvers<string>();

  const server = Bun.serve({
    hostname: "localhost",
    port: REDIRECT_PORT,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/" || url.pathname === "") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          rejectCode(new Error(`Google OAuth error: ${error}`));
          return new Response(
            "<html><body><h2>Authorization failed</h2><p>You can close this tab.</p></body></html>",
            { headers: { "Content-Type": "text/html" } },
          );
        }

        if (!code) {
          rejectCode(new Error("No authorization code received"));
          return new Response(
            "<html><body><h2>Error: no code received</h2></body></html>",
            { headers: { "Content-Type": "text/html" } },
          );
        }

        resolveCode(code);
        return new Response(
          "<html><body><h2>Authorization successful!</h2><p>You can close this tab and return to your terminal.</p></body></html>",
          { headers: { "Content-Type": "text/html" } },
        );
      }

      return new Response("Not found", { status: 404 });
    },
  });

  log("INFO", `Local server listening on http://localhost:${REDIRECT_PORT}`);
  log("INFO", "Opening browser for Google authorization...\n");

  // Open browser
  Bun.spawn(["open", authUrl.toString()]);

  console.log("  If the browser didn't open, visit this URL:");
  console.log(`  ${authUrl.toString()}\n`);

  // Wait for the authorization code
  let code: string;
  try {
    code = await codePromise;
  } catch (err) {
    server.stop();
    log("ERROR", err instanceof Error ? err.message : "Authorization failed");
    process.exit(1);
  }

  log("OK", "Authorization code received");

  // Exchange code for tokens
  log("INFO", "Exchanging code for tokens...");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    server.stop();
    log("ERROR", `Token exchange failed (${tokenRes.status}): ${body}`);
    process.exit(1);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };

  if (!tokens.refresh_token) {
    server.stop();
    log("ERROR", "No refresh token received. This can happen if you previously authorized this app.");
    log("INFO", "Go to https://myaccount.google.com/connections and remove SCAF, then try again.");
    process.exit(1);
  }

  // Validate scopes
  const grantedScopes = tokens.scope.split(" ");
  const requestedScopes = SCOPES.split(" ");
  const missing = requestedScopes.filter((s) => !grantedScopes.includes(s));
  if (missing.length > 0) {
    log("WARN", `Some scopes were not granted: ${missing.join(", ")}`);
    log("WARN", "The connector may not work fully without all scopes.");
  }

  // Save refresh token to .env
  updateEnvFile(ENV_FILE, "GOOGLE_REFRESH_TOKEN", tokens.refresh_token);
  log("OK", "GOOGLE_REFRESH_TOKEN written to .env");

  server.stop();

  console.log("\n  Next steps:");
  console.log("    1. Run: bun run setup    (to push secrets to Cloudflare)");
  console.log("    2. Or:  bun run dev:google  (to test locally)\n");
}

main().catch((err) => {
  console.error("\x1b[31mGoogle auth failed:\x1b[0m", err);
  process.exit(1);
});
