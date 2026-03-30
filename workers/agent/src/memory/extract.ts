import type { CompletionRequest, CompletionResponse } from "@veeclaw/shared";
import { MEMORY_MODEL, DEFAULT_MEMORY_CONFIG } from "./types.ts";
import type { MemoryData } from "./types.ts";
import {
  mergeFacts,
  trimFactsToTokenBudget,
  markStaleFacts,
} from "./utils.ts";

/**
 * Extract facts from a conversation turn and merge into existing facts.
 * Mutates and returns the MemoryData — caller is responsible for saving.
 */
export async function extractFacts(
  data: MemoryData,
  llmGateway: Fetcher,
  userMessage: string,
  assistantResponse: string
): Promise<MemoryData> {
  const existingFacts = data.facts || "";

  const req: CompletionRequest = {
    model: MEMORY_MODEL,
    system: `Extract factual information about the owner from this conversation turn.
Output ONLY a markdown list of facts in this format:
- preference: <value> [YYYY-MM-DD]
- project: <value> [YYYY-MM-DD]
- name: <value> [YYYY-MM-DD]

Rules:
- Only extract facts explicitly stated by the owner, not inferred.
- If a fact duplicates an existing one, output the updated version only.
- If no new facts are present, output: (none)
- Do not include assistant statements as facts.
- Use today's date for the date tag.`,
    messages: [
      {
        role: "user",
        content: `Existing facts:\n${existingFacts || "(none)"}\n\nConversation turn:\nowner: ${userMessage}\nassistant: ${assistantResponse}`,
      },
    ],
  };

  const res = await llmGateway.fetch("https://internal/v1/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) return data;

  const result = (await res.json()) as CompletionResponse;
  const newFacts = result.content?.trim();
  if (!newFacts || newFacts === "(none)") return data;

  let merged = mergeFacts(existingFacts, newFacts);
  merged = markStaleFacts(merged, DEFAULT_MEMORY_CONFIG.staleDays);
  merged = trimFactsToTokenBudget(merged, DEFAULT_MEMORY_CONFIG.factsMaxTokens);

  data.facts = merged;
  return data;
}
