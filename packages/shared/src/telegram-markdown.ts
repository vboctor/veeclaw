/**
 * Convert standard Markdown (from LLM output) to Telegram HTML.
 *
 * Telegram HTML reliably renders links, bold, italic, and code blocks.
 * Supported tags: <b>, <i>, <code>, <pre>, <a>.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Convert inline markdown formatting to Telegram HTML.
 */
function convertInline(text: string): string {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const patterns = [
      { regex: /\*\*(.+?)\*\*/s, type: "bold" },
      { regex: /\*(.+?)\*/s, type: "italic" },
      { regex: /`([^`]+)`/, type: "code" },
      { regex: /\[([^\]]+)\]\(([^)]+)\)/, type: "link" },
    ];

    let earliest: {
      index: number;
      match: RegExpExecArray;
      type: string;
    } | null = null;

    for (const p of patterns) {
      const m = p.regex.exec(remaining);
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, match: m, type: p.type };
      }
    }

    if (!earliest) {
      parts.push(escapeHtml(remaining));
      break;
    }

    if (earliest.index > 0) {
      parts.push(escapeHtml(remaining.slice(0, earliest.index)));
    }

    const m = earliest.match;

    switch (earliest.type) {
      case "bold":
        parts.push(`<b>${convertInline(m[1])}</b>`);
        break;
      case "italic":
        parts.push(`<i>${convertInline(m[1])}</i>`);
        break;
      case "code":
        parts.push(`<code>${escapeHtml(m[1])}</code>`);
        break;
      case "link":
        // Recursively convert inline formatting inside link text (e.g., **#1144**)
        parts.push(
          `<a href="${m[2].replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${convertInline(m[1])}</a>`,
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
        const langAttr = codeBlockLang
          ? ` class="language-${escapeHtml(codeBlockLang)}"`
          : "";
        result.push(
          `<pre><code${langAttr}>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`,
        );
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

    // Headers — convert to bold
    const headerMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headerMatch) {
      result.push(`<b>${convertInline(headerMatch[2])}</b>`);
      continue;
    }

    // All other lines get inline conversion
    result.push(convertInline(line));
  }

  // Handle unclosed code block
  if (inCodeBlock) {
    const langAttr = codeBlockLang
      ? ` class="language-${escapeHtml(codeBlockLang)}"`
      : "";
    result.push(
      `<pre><code${langAttr}>${escapeHtml(codeBlockLines.join("\n"))}</code></pre>`,
    );
  }

  return result.join("\n");
}
