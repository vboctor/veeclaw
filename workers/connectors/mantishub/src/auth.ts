export interface Env {
  CONNECTOR_KV: KVNamespace;
}

export interface InstanceConfig {
  name: string;
  baseUrl: string;
  token: string;
  default?: boolean;
}

/**
 * Resolve a MantisHub instance config from KV.
 * If instanceName is provided, look up that specific instance.
 * If omitted, use the default instance.
 */
export async function resolveInstance(
  env: Env,
  instanceName?: string,
): Promise<InstanceConfig> {
  if (instanceName) {
    const raw = await env.CONNECTOR_KV.get(`instance:${instanceName}`);
    if (!raw) {
      const index = await getInstanceIndex(env);
      throw new Error(
        `Unknown MantisHub instance: "${instanceName}". Available: ${index.join(", ")}`,
      );
    }
    return JSON.parse(raw) as InstanceConfig;
  }

  // Find default instance
  const index = await getInstanceIndex(env);
  if (index.length === 0) {
    throw new Error(
      "No MantisHub instances configured. Run: bun run mantishub-auth",
    );
  }

  for (const name of index) {
    const raw = await env.CONNECTOR_KV.get(`instance:${name}`);
    if (!raw) continue;
    const config = JSON.parse(raw) as InstanceConfig;
    if (config.default) return config;
  }

  // Fallback to first instance
  const raw = await env.CONNECTOR_KV.get(`instance:${index[0]}`);
  if (!raw) {
    throw new Error("Default MantisHub instance config is missing from KV");
  }
  return JSON.parse(raw) as InstanceConfig;
}

async function getInstanceIndex(env: Env): Promise<string[]> {
  const raw = await env.CONNECTOR_KV.get("instances:index");
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}
