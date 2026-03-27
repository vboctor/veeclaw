import type { Message } from "@scaf/shared";

export interface MemoryConfig {
  workingWindow: number;
  workingTtl: number;
  summaryMaxTokens: number;
  summaryTtl: number;
  factsMaxTokens: number;
  factsTtl: number;
  staleDays: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  workingWindow: 20,
  workingTtl: 86400,
  summaryMaxTokens: 600,
  summaryTtl: 2592000,
  factsMaxTokens: 800,
  factsTtl: 7776000,
  staleDays: 60,
};

export interface LoadedMemory {
  messages: Message[];
  summaryBlock: string | null;
  factsBlock: string | null;
}

export const MEMORY_MODEL = "anthropic/claude-haiku-4.5";
