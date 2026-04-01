import type { Env } from "./auth.ts";
import { getToken } from "./auth.ts";

const API_BASE = "https://api.github.com";

/**
 * Fetch wrapper for GitHub APIs. Injects Authorization, Accept, and API version headers.
 */
export async function githubFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getToken(env);
  const url = path.startsWith("https://") ? path : `${API_BASE}${path}`;

  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VeeClaw/1.0",
    },
  });
}

/**
 * Helper: call a GitHub API and return parsed JSON, or a structured error Response.
 */
export async function githubJson<T>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<{ data?: T; error?: Response }> {
  const res = await githubFetch(env, path, init);

  if (!res.ok) {
    const text = await res.text();
    return {
      error: Response.json(
        { error: text, status: res.status },
        { status: res.status },
      ),
    };
  }

  const data = (await res.json()) as T;
  return { data };
}

/**
 * Fetch raw content from GitHub (e.g., diffs) with a custom Accept header.
 */
export async function githubRaw(
  env: Env,
  path: string,
  accept: string,
): Promise<{ data?: string; error?: Response }> {
  const token = getToken(env);
  const url = path.startsWith("https://") ? path : `${API_BASE}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VeeClaw/1.0",
    },
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

  const data = await res.text();
  return { data };
}
