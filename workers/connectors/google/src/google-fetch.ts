import type { Env } from "./auth.ts";
import { getAccessToken, evictTokenCache } from "./auth.ts";

/**
 * Fetch wrapper for Google APIs. Injects Authorization header,
 * retries once on 401 after evicting the cached token.
 */
export async function googleFetch(
  env: Env,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getAccessToken(env);

  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  // Retry once on 401 (token may have been revoked between cache and use)
  if (res.status === 401) {
    await evictTokenCache(env);
    const freshToken = await getAccessToken(env);
    return fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${freshToken}`,
      },
    });
  }

  return res;
}

/**
 * Helper: call a Google API and return parsed JSON, or a structured error Response.
 */
export async function googleJson<T>(
  env: Env,
  url: string,
  init: RequestInit = {},
): Promise<{ data?: T; error?: Response }> {
  const res = await googleFetch(env, url, init);

  if (!res.ok) {
    const text = await res.text();
    return {
      error: Response.json({ error: text, status: res.status }, { status: res.status }),
    };
  }

  const data = (await res.json()) as T;
  return { data };
}
