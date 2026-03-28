import type { Message, CompletionRequest, CompletionResponse } from "@scaf/shared";
import { MEMORY_MODEL } from "./types.ts";
import { getSummary, putSummary, putWorkingMemory } from "./store.ts";

export async function maybeSummarize(
  kv: KVNamespace,
  llmGateway: Fetcher,
  working: Message[]
): Promise<void> {
  const mid = Math.floor(working.length / 2);
  const toSummarize = working.slice(0, mid);
  const toKeep = working.slice(mid);

  const existingSummary = (await getSummary(kv)) ?? "";

  const conversationText = toSummarize
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = existingSummary
    ? `Existing summary:\n${existingSummary}\n\nNew conversation to incorporate:\n${conversationText}\n\nWrite an updated summary that merges both, under 600 tokens.`
    : `Conversation to summarize:\n${conversationText}\n\nWrite a concise summary, under 600 tokens.`;

  const req: CompletionRequest = {
    model: MEMORY_MODEL,
    system:
      "You are a memory summarization assistant. Write concise, third-person summaries that preserve key facts, decisions, preferences, and ongoing context. Be specific; avoid vague statements.",
    messages: [{ role: "user", content: prompt }],
  };

  const res = await llmGateway.fetch("https://internal/v1/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) return;

  const data = (await res.json()) as CompletionResponse;
  const summary = data.content;
  if (!summary) return;

  await Promise.all([putSummary(kv, summary), putWorkingMemory(kv, toKeep)]);
}
