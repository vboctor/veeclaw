import { MEMORY_MODEL, DEFAULT_MEMORY_CONFIG } from "./types.ts";
import { getFacts, putFacts } from "./store.ts";
import {
  mergeFacts,
  trimFactsToTokenBudget,
  markStaleFacts,
} from "./utils.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function extractFacts(
  kv: KVNamespace,
  apiKey: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const existingFacts = (await getFacts(kv)) ?? "";

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
      max_tokens: 300,
      temperature: 0,
      stream: false,
      messages: [
        {
          role: "system",
          content: `Extract factual information about the owner from this conversation turn.
Output ONLY a markdown list of facts in this format:
- preference: <value> [YYYY-MM-DD]
- project: <value> [YYYY-MM-DD]
- name: <value> [YYYY-MM-DD]

Rules:
- Only extract facts explicitly stated by the owner, not inferred.
- If a fact duplicates an existing one, output the updated version only.
- If no new facts are present, output: (none)
- Do not include assistant statements as facts.
- Use today's date for the date tag.`,
        },
        {
          role: "user",
          content: `Existing facts:\n${existingFacts || "(none)"}\n\nConversation turn:\nowner: ${userMessage}\nassistant: ${assistantResponse}`,
        },
      ],
    }),
  });

  if (!response.ok) return;

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const newFacts = data.choices?.[0]?.message?.content?.trim();
  if (!newFacts || newFacts === "(none)") return;

  let merged = mergeFacts(existingFacts, newFacts);
  merged = markStaleFacts(merged, DEFAULT_MEMORY_CONFIG.staleDays);
  merged = trimFactsToTokenBudget(merged, DEFAULT_MEMORY_CONFIG.factsMaxTokens);

  await putFacts(kv, merged);
}
