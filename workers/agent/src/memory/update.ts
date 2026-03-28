import { DEFAULT_MEMORY_CONFIG } from "./types.ts";
import type { MemoryData } from "./types.ts";
import { maybeSummarize } from "./summarize.ts";

/**
 * Append a user/assistant turn to working memory and optionally summarize.
 * Mutates and returns the MemoryData — caller is responsible for saving.
 */
export async function appendToWorkingMemory(
  data: MemoryData,
  llmGateway: Fetcher,
  userMessage: string,
  assistantResponse: string
): Promise<MemoryData> {
  data.working.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantResponse }
  );

  const pairs = Math.floor(data.working.length / 2);
  if (pairs >= DEFAULT_MEMORY_CONFIG.workingWindow) {
    return maybeSummarize(data, llmGateway);
  }

  return data;
}
