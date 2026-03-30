import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@veeclaw/shared";

export interface AgentEnv {
  AGENT: Fetcher;
  AGENT_TOKEN: string;
}

export async function complete(
  env: AgentEnv,
  messages: Message[],
  model?: string
): Promise<string> {
  const body: CompletionRequest = { messages };
  if (model) body.model = model;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  headers["Authorization"] = `Bearer ${env.AGENT_TOKEN}`;

  const res = await env.AGENT.fetch("https://internal/v1/complete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as CompletionResponse;
  return data.content;
}
