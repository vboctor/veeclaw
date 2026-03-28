export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  TOOL_CACHE: KVNamespace;
}

const TOKEN_CACHE_KEY = "google:access_token";
const TOKEN_TTL_SECONDS = 55 * 60; // 55 min (tokens last 60)

export async function getAccessToken(env: Env): Promise<string> {
  // Check KV cache first
  const cached = await env.TOOL_CACHE.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  // Refresh token
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 400 && body.includes("invalid_grant")) {
      throw new Error(
        "Google refresh token revoked or expired. Re-run: bun run google-auth",
      );
    }
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };

  await env.TOOL_CACHE.put(TOKEN_CACHE_KEY, data.access_token, {
    expirationTtl: TOKEN_TTL_SECONDS,
  });

  return data.access_token;
}

export async function evictTokenCache(env: Env): Promise<void> {
  await env.TOOL_CACHE.delete(TOKEN_CACHE_KEY);
}
