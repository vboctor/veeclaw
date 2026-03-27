import type { LLMGateway } from "./types.ts";
import { createOpenRouterGateway } from "./openrouter.ts";
import { createWorkerGateway } from "./worker-client.ts";
import { hasSecret } from "../secrets/secrets.ts";

export type Provider = "worker" | "openrouter";

export function detectProvider(): Provider {
  if (hasSecret("gateway_url")) return "worker";
  if (hasSecret("openrouter_api_key")) return "openrouter";
  throw new Error("No LLM provider configured. Run scaf to set it up.");
}

export function createGateway(provider?: Provider): LLMGateway {
  const p = provider ?? detectProvider();
  switch (p) {
    case "worker":
      return createWorkerGateway();
    case "openrouter":
      return createOpenRouterGateway();
    default:
      throw new Error(`Unknown LLM provider: ${p}`);
  }
}
