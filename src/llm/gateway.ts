import type { LLMGateway } from "./types.ts";
import { createOpenRouterGateway } from "./openrouter.ts";
import { createWorkerGateway } from "./worker-client.ts";
import { hasSecret } from "../secrets/secrets.ts";

export type Provider = "agent" | "openrouter";

export function detectProvider(): Provider {
  if (hasSecret("agent_url")) return "agent";
  if (hasSecret("openrouter_api_key")) return "openrouter";
  throw new Error("No LLM provider configured. Run veeclaw to set it up.");
}

export function createGateway(provider?: Provider): LLMGateway {
  const p = provider ?? detectProvider();
  switch (p) {
    case "agent":
      return createWorkerGateway();
    case "openrouter":
      return createOpenRouterGateway();
    default:
      throw new Error(`Unknown LLM provider: ${p}`);
  }
}
