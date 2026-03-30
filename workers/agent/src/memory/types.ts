import type { Message } from "@veeclaw/shared";

export interface MemoryConfig {
  workingWindow: number;
  summaryMaxTokens: number;
  factsMaxTokens: number;
  staleDays: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  workingWindow: 20,
  summaryMaxTokens: 600,
  factsMaxTokens: 800,
  staleDays: 60,
};

export interface MemoryData {
  working: Message[];
  summary: string;
  facts: string;
}

export interface LoadedMemory {
  messages: Message[];
  summaryBlock: string | null;
  factsBlock: string | null;
}

export const MEMORY_MODEL = "anthropic/claude-haiku-4.5";
