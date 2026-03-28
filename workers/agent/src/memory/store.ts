import type { Message } from "@scaf/shared";
import { DEFAULT_MEMORY_CONFIG } from "./types.ts";

const config = DEFAULT_MEMORY_CONFIG;

export async function getWorkingMemory(kv: KVNamespace): Promise<Message[]> {
  return (await kv.get<Message[]>("memory:working", "json")) ?? [];
}

export async function putWorkingMemory(
  kv: KVNamespace,
  messages: Message[]
): Promise<void> {
  await kv.put("memory:working", JSON.stringify(messages), {
    expirationTtl: config.workingTtl,
  });
}

export async function getSummary(kv: KVNamespace): Promise<string | null> {
  return await kv.get("memory:summary");
}

export async function putSummary(
  kv: KVNamespace,
  summary: string
): Promise<void> {
  await kv.put("memory:summary", summary, {
    expirationTtl: config.summaryTtl,
  });
}

export async function getFacts(kv: KVNamespace): Promise<string | null> {
  return await kv.get("memory:facts");
}

export async function putFacts(
  kv: KVNamespace,
  facts: string
): Promise<void> {
  await kv.put("memory:facts", facts, {
    expirationTtl: config.factsTtl,
  });
}
