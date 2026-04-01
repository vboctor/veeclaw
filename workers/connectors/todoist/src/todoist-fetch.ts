import type { Env } from "./auth.ts";
import { getToken } from "./auth.ts";

const API_BASE = "https://api.todoist.com/api/v1";

/**
 * Fetch wrapper for Todoist REST API.
 */
export async function todoistFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken(env);
  const url = `${API_BASE}${path}`;

  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Helper: call Todoist API and return parsed JSON, or a structured error Response.
 */
export async function todoistJson<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<{ data?: T; error?: Response }> {
  const res = await todoistFetch(env, path, init);

  if (!res.ok) {
    const text = await res.text();
    return {
      error: Response.json(
        { error: text, status: res.status },
        { status: res.status },
      ),
    };
  }

  // Some endpoints return 204 No Content
  if (res.status === 204) {
    return { data: {} as T };
  }

  const data = (await res.json()) as T;
  return { data };
}
