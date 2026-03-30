import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const SECRETS_DIR = join(homedir(), ".veeclaw");
const SECRETS_FILE = join(SECRETS_DIR, "secrets.json");

function readSecrets(): Record<string, string> {
  if (!existsSync(SECRETS_FILE)) return {};
  try {
    const text = readFileSync(SECRETS_FILE, "utf-8");
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function writeSecrets(secrets: Record<string, string>): void {
  if (!existsSync(SECRETS_DIR)) {
    mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  }
  writeFileSync(
    SECRETS_FILE,
    JSON.stringify(secrets, null, 2) + "\n",
    { mode: 0o600 }
  );
}

export function getSecret(key: string): string | undefined {
  return readSecrets()[key];
}

export function setSecret(key: string, value: string): void {
  const secrets = readSecrets();
  secrets[key] = value;
  writeSecrets(secrets);
}

export function deleteSecret(key: string): void {
  const secrets = readSecrets();
  delete secrets[key];
  writeSecrets(secrets);
}

export function hasSecret(key: string): boolean {
  return getSecret(key) !== undefined;
}
