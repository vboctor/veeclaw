import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@scaf/shared";

export interface GatewayEnv {
  LLM_GATEWAY: Fetcher;
  LLM_GATEWAY_URL: string;
  LLM_GATEWAY_TOKEN?: string;
}

export async function complete(
  env: GatewayEnv,
  messages: Message[],
  model?: string
): Promise<string> {
  const body: CompletionRequest = { messages };
  if (model) body.model = model;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.LLM_GATEWAY_TOKEN) {
    headers["Authorization"] = `Bearer ${env.LLM_GATEWAY_TOKEN}`;
  }

  // Use service binding for Worker-to-Worker calls
  const target = env.LLM_GATEWAY;
  const res = await target.fetch("https://internal/v1/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM gateway error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as CompletionResponse;
  return data.content;
}
