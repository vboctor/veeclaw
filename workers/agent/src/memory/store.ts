import type { MemoryData } from "./types.ts";

const MEMORY_KEY = "memory";

const EMPTY: MemoryData = { working: [], summary: "", facts: "" };

export async function loadMemoryData(kv: KVNamespace): Promise<MemoryData> {
  const raw = await kv.get(MEMORY_KEY);
  return raw ? (JSON.parse(raw) as MemoryData) : { ...EMPTY };
}

export async function saveMemoryData(kv: KVNamespace, data: MemoryData): Promise<void> {
  await kv.put(MEMORY_KEY, JSON.stringify(data));
}
