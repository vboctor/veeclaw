import type { Message } from "@veeclaw/shared";

const MAX_MESSAGES_PER_CHAT = 20;

const histories = new Map<number, Message[]>();

export function getHistory(chatId: number): Message[] {
  return histories.get(chatId) ?? [];
}

export function appendToHistory(
  chatId: number,
  ...messages: Message[]
): void {
  const history = histories.get(chatId) ?? [];
  history.push(...messages);

  // Keep only the last N messages
  if (history.length > MAX_MESSAGES_PER_CHAT) {
    history.splice(0, history.length - MAX_MESSAGES_PER_CHAT);
  }

  histories.set(chatId, history);
}

export function clearHistory(chatId: number): void {
  histories.delete(chatId);
}
