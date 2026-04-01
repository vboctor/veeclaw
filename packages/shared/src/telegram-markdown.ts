/**
 * Convert standard Markdown (from LLM output) to Telegram MarkdownV2.
 *
 * Telegram MarkdownV2 requires escaping special characters outside of
 * code blocks/inline code, and doesn't support headers or horizontal rules.
 */

// Characters that must be escaped in MarkdownV2 (outside code blocks)
const ESCAPE_CHARS = /([_~|{}.!>\-\\#+=\[\]()])/g;

/**
 * Escape a string for Telegram MarkdownV2, preserving bold/italic/link markup.
 */
function escapeSegment(text: string): string {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const patterns = [
      { regex: /\*\*(.+?)\*\*/s, type: "bold" },
      { regex: /\*(.+?)\*/s, type: "italic" },
      { regex: /`([^`]+)`/, type: "code" },
      { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: "link" },
    ];

    let earliest: { index: number; match: RegExpExecArray; type: string } | null = null;

    for (const p of patterns) {
      const m = p.regex.exec(remaining);
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m, type: p.type };
      }
    }

    if (!earliest) {
      parts.push(remaining.replace(ESCAPE_CHARS, "\\$1"));
      break;
    }

    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index).replace(ESCAPE_CHARS, "\\$1"));
    }

    const m = earliest.match;

    switch (earliest.type) {
      case "bold":
        parts.push(`*${m[1].replace(ESCAPE_CHARS, "\\$1")}*`);
        break;
      case "italic":
        parts.push(`_${m[1].replace(ESCAPE_CHARS, "\\$1")}_`);
        break;
      case "code":
        parts.push(`\`${m[1].replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``);
        break;
      case "link":
        parts.push(
          `[${m[1].replace(ESCAPE_CHARS, "\\$1")}](${m[2].replace(/[)\\]/g, "\\$&")})`
        );
        break;
    }

    remaining = remaining.slice(earliest.index + m[0].length);
  }

  return parts.join("");
}

export function toTelegramMarkdown(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  const codeBlockLines: string[] = [];

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trimStart().slice(3).trim();
        codeBlockLines.length = 0;
        continue;
      } else {
        const lang = codeBlockLang ? `${codeBlockLang}\n` : "";
        result.push(`\`\`\`${lang}${codeBlockLines.join("\n")}\`\`\``);
        inCodeBlock = false;
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Horizontal rules — replace with blank line
    if (/^---+$/.test(line.trim())) {
      result.push("");
      continue;
    }

    // Headers — convert to bold text
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      result.push(`*${headerMatch[2].replace(ESCAPE_CHARS, "\\$1")}*`);
      continue;
    }

    // Bullet points
    const bulletMatch = line.match(/^(\s*[-*•])\s+(.*)/);
    if (bulletMatch) {
      const indent = bulletMatch[1].replace(/[-*•]/g, (ch) =>
        ch === "-" ? "\\-" : ch === "*" ? "\\*" : ch
      );
      result.push(`${indent} ${escapeSegment(bulletMatch[2])}`);
      continue;
    }

    // Numbered list items
    const numberedMatch = line.match(/^(\s*\d+[.)]) (.*)/);
    if (numberedMatch) {
      const prefix = numberedMatch[1].replace(ESCAPE_CHARS, "\\$1");
      result.push(`${prefix} ${escapeSegment(numberedMatch[2])}`);
      continue;
    }

    // Regular line
    result.push(escapeSegment(line));
  }

  // Handle unclosed code block
  if (inCodeBlock) {
    const lang = codeBlockLang ? `${codeBlockLang}\n` : "";
    result.push(`\`\`\`${lang}${codeBlockLines.join("\n")}\`\`\``);
  }

  return result.join("\n");
}
