import type { Message } from "@scaf/shared";
import { DEFAULT_MEMORY_CONFIG } from "./types.ts";
import { getWorkingMemory, putWorkingMemory } from "./store.ts";
import { maybeSummarize } from "./summarize.ts";

export async function appendToWorkingMemory(
  kv: KVNamespace,
  llmGateway: Fetcher,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const existing = await getWorkingMemory(kv);

  existing.push(
    { role: "user", content: userMessage },
    { role: "assistant", content: assistantResponse }
  );

  await putWorkingMemory(kv, existing);

  const pairs = Math.floor(existing.length / 2);
  if (pairs >= DEFAULT_MEMORY_CONFIG.workingWindow) {
    await maybeSummarize(kv, llmGateway, existing);
  }
}
