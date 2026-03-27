export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function extractDate(line: string): string | null {
  const match = line.match(/\[(\d{4}-\d{2}-\d{2})\]/);
  return match ? match[1] : null;
}

export function trimFactsToTokenBudget(
  facts: string,
  maxTokens: number
): string {
  const lines = facts.split("\n").filter((l) => l.trim().startsWith("-"));
  if (lines.length === 0) return "";

  lines.sort((a, b) => {
    const dateA = extractDate(a) ?? "2000-01-01";
    const dateB = extractDate(b) ?? "2000-01-01";
    return dateB.localeCompare(dateA);
  });

  const kept: string[] = [];
  let tokens = 0;
  for (const line of lines) {
    const lineTokens = estimateTokens(line);
    if (tokens + lineTokens > maxTokens) break;
    kept.push(line);
    tokens += lineTokens;
  }
  return kept.join("\n");
}

export function markStaleFacts(facts: string, staleDays = 60): string {
  const cutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return facts
    .split("\n")
    .map((line) => {
      const date = extractDate(line);
      if (
        date &&
        new Date(date).getTime() < cutoff &&
        !line.includes("[stale]")
      ) {
        return line.replace(/\[(\d{4}-\d{2}-\d{2})\]/, "[$1][stale]");
      }
      return line;
    })
    .join("\n");
}

export function mergeFacts(existing: string, extracted: string): string {
  const existingLines = existing
    .split("\n")
    .filter((l) => l.trim().startsWith("-"));
  const newLines = extracted
    .split("\n")
    .filter((l) => l.trim().startsWith("-"));

  // Build a map keyed by the fact prefix (category: value) without the date
  const factMap = new Map<string, string>();

  for (const line of existingLines) {
    const key = factKey(line);
    if (key) factMap.set(key, line);
  }

  for (const line of newLines) {
    const key = factKey(line);
    if (key) factMap.set(key, line); // newer replaces older
  }

  return Array.from(factMap.values()).join("\n");
}

function factKey(line: string): string | null {
  // Extract "- category: value" ignoring the date suffix
  const match = line.match(/^-\s*(.+?)(?:\s*\[\d{4}-\d{2}-\d{2}\].*)?$/);
  return match ? match[1].trim().toLowerCase() : null;
}
