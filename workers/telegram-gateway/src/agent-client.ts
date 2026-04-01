import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@veeclaw/shared";

export interface AgentEnv {
  AGENT: Fetcher;
  AGENT_TOKEN: string;
}

const AGENT_TIMEOUT_MS = 120_000; // 2 minutes

export async function complete(
  env: AgentEnv,
  messages: Message[],
  model?: string
): Promise<string> {
  const body: CompletionRequest = { messages };
  if (model) body.model = model;

  const fetchPromise = env.AGENT.fetch("https://internal/v1/complete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.AGENT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Request timed out — the operation took too long. Try a simpler request.")),
      AGENT_TIMEOUT_MS,
    ),
  );

  const res = await Promise.race([fetchPromise, timeoutPromise]);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Agent error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as CompletionResponse;
  return data.content;
}
