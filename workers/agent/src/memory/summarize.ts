import type { CompletionRequest, CompletionResponse } from "@scaf/shared";
import { MEMORY_MODEL } from "./types.ts";
import type { MemoryData } from "./types.ts";

/**
 * Summarize the older half of working memory into the summary block.
 * Mutates and returns the MemoryData — caller is responsible for saving.
 */
export async function maybeSummarize(
  data: MemoryData,
  llmGateway: Fetcher,
): Promise<MemoryData> {
  const mid = Math.floor(data.working.length / 2);
  const toSummarize = data.working.slice(0, mid);
  const toKeep = data.working.slice(mid);

  const existingSummary = data.summary || "";

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

  if (!res.ok) return data;

  const result = (await res.json()) as CompletionResponse;
  const summary = result.content;
  if (!summary) return data;

  data.summary = summary;
  data.working = toKeep;
  return data;
}
