import type { LLMGateway } from "./types.ts";
import { createOpenRouterGateway } from "./openrouter.ts";

export type Provider = "openrouter";

export function createGateway(provider: Provider = "openrouter"): LLMGateway {
  switch (provider) {
    case "openrouter":
      return createOpenRouterGateway();
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
