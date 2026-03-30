import type { CompletionRequest } from "@veeclaw/shared";
import type { LoadedMemory, MemoryData } from "./types.ts";
import { loadMemoryData } from "./store.ts";

export { loadMemoryData };

export async function loadMemory(kv: KVNamespace): Promise<LoadedMemory> {
  const data = await loadMemoryData(kv);
  return toLoadedMemory(data);
}

export function toLoadedMemory(data: MemoryData): LoadedMemory {
  return {
    messages: data.working,
    summaryBlock: data.summary || null,
    factsBlock: data.facts || null,
  };
}

function formatWorkingMemoryBlock(messages: { role: string; content: string }[]): string {
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
