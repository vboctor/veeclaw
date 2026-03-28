import type { CompletionRequest, Message } from "@scaf/shared";
import type { LoadedMemory } from "./types.ts";
import { getWorkingMemory, getSummary, getFacts } from "./store.ts";

export async function loadMemory(kv: KVNamespace): Promise<LoadedMemory> {
  const [messages, summary, facts] = await Promise.all([
    getWorkingMemory(kv),
    getSummary(kv),
    getFacts(kv),
  ]);

  return {
    messages,
    summaryBlock: summary,
    factsBlock: facts,
  };
}

function formatWorkingMemoryBlock(messages: Message[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

export function injectMemory(
  req: CompletionRequest,
  memory: LoadedMemory
): CompletionRequest {
  const systemParts: string[] = [];

  if (req.system) {
    systemParts.push(req.system);
  }

  if (memory.factsBlock) {
    systemParts.push(`## What I know about you\n${memory.factsBlock}`);
  }

  if (memory.summaryBlock) {
    systemParts.push(
      `## Our conversation history\n${memory.summaryBlock}`
    );
  }

  // Inject working memory as context in the system prompt, not as messages.
  // The client already sends its own conversation history in messages —
  // injecting as messages causes duplication and the model re-answers old questions.
  if (memory.messages.length > 0) {
    systemParts.push(
      `## Recent conversation (prior session)\n${formatWorkingMemoryBlock(memory.messages)}`
    );
  }

  return {
    ...req,
    system: systemParts.length > 0 ? systemParts.join("\n\n---\n\n") : undefined,
  };
}
