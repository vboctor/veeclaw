import type { InstanceConfig } from "./auth.ts";

const APIX_PATH = "/api/rest/plugins/ApiX";

/**
 * Fetch wrapper for MantisHub ApiX REST API.
 * Injects Authorization header and routes to the correct instance.
 */
export async function mantishubFetch(
  config: InstanceConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${config.baseUrl}${APIX_PATH}${path}`;

  return fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: config.token,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Helper: call MantisHub API and return parsed JSON, or a structured error Response.
 */
export async function mantishubJson<T>(
  config: InstanceConfig,
  path: string,
  init: RequestInit = {},
): Promise<{ data?: T; error?: Response }> {
  const res = await mantishubFetch(config, path, init);

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
