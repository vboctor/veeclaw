/** Telegram message limit */
const MAX_LENGTH = 4096;

/**
 * Split text into chunks that fit within Telegram's message limit,
 * breaking at paragraph or sentence boundaries when possible.
 */
export function chunkText(text: string, maxLength = MAX_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    const slice = remaining.slice(0, maxLength);

    // Try to break at a paragraph boundary
    let breakIdx = slice.lastIndexOf("\n\n");

    // Fall back to a single newline
    if (breakIdx < maxLength * 0.3) {
      breakIdx = slice.lastIndexOf("\n");
    }

    // Fall back to sentence boundary
    if (breakIdx < maxLength * 0.3) {
      breakIdx = slice.lastIndexOf(". ");
      if (breakIdx !== -1) breakIdx += 1; // include the period
    }

    // Last resort: break at space
    if (breakIdx < maxLength * 0.3) {
      breakIdx = slice.lastIndexOf(" ");
    }

    // Absolute last resort: hard break
    if (breakIdx < maxLength * 0.3) {
      breakIdx = maxLength;
    }

    chunks.push(remaining.slice(0, breakIdx).trimEnd());
    remaining = remaining.slice(breakIdx).trimStart();
  }

  return chunks;
}
