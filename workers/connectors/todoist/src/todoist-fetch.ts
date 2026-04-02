import type { Env } from "./auth.ts";
import { getToken } from "./auth.ts";

const SYNC_URL = "https://api.todoist.com/api/v1/sync";

/**
 * Perform a Sync API read request (fetch resources).
 */
export async function syncRead(
  env: Env,
  resourceTypes: string[],
): Promise<{ data?: Record<string, unknown>; error?: Response }> {
  const token = getToken(env);

  const res = await fetch(SYNC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      sync_token: "*",
      resource_types: JSON.stringify(resourceTypes),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      error: Response.json(
        { error: text, status: res.status },
        { status: res.status },
      ),
    };
  }

  const data = (await res.json()) as Record<string, unknown>;
  return { data };
}

interface SyncCommand {
  type: string;
  uuid: string;
  temp_id?: string;
  args: Record<string, unknown>;
}

/**
 * Execute one or more Sync API commands (write operations).
 * Returns the sync_status and temp_id_mapping.
 */
export async function syncWrite(
  env: Env,
  commands: SyncCommand[],
): Promise<{
  data?: {
    sync_status: Record<string, unknown>;
    temp_id_mapping: Record<string, string>;
  };
  error?: Response;
}> {
  const token = getToken(env);

  const res = await fetch(SYNC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      commands: JSON.stringify(commands),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      error: Response.json(
        { error: text, status: res.status },
        { status: res.status },
      ),
    };
  }

  const data = (await res.json()) as {
    sync_status: Record<string, unknown>;
    temp_id_mapping: Record<string, string>;
  };

  // Check for command-level errors
  for (const [uuid, status] of Object.entries(data.sync_status)) {
    if (status !== "ok") {
      return {
        error: Response.json(
          { error: `Command ${uuid} failed`, details: status },
          { status: 400 },
        ),
      };
    }
  }

  return { data };
}
