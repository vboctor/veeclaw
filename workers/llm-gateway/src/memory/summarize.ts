import type { Message } from "@scaf/shared";
import { MEMORY_MODEL, DEFAULT_MEMORY_CONFIG } from "./types.ts";
import { getSummary, putSummary, putWorkingMemory } from "./store.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function maybeSummarize(
  kv: KVNamespace,
  apiKey: string,
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

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/vboctor/scaf",
      "X-Title": "SCAF",
    },
    body: JSON.stringify({
      model: MEMORY_MODEL,
      max_tokens: 600,
      temperature: 0,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a memory summarization assistant. Write concise, third-person summaries that preserve key facts, decisions, preferences, and ongoing context. Be specific; avoid vague statements.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return;

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary = data.choices?.[0]?.message?.content;
  if (!summary) return;

  await Promise.all([putSummary(kv, summary), putWorkingMemory(kv, toKeep)]);
}
