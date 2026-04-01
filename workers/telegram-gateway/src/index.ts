import type { Message } from "@veeclaw/shared";
import { complete, type AgentEnv } from "./agent-client.ts";
import { getHistory, appendToHistory, clearHistory } from "./history.ts";
import { chunkText } from "./chunks.ts";
import { toTelegramMarkdown } from "@veeclaw/shared";

const TELEGRAM_API = "https://api.telegram.org";

interface Env extends AgentEnv {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_CHAT_IDS: string;
}

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    text?: string;
    entities?: Array<{ type: string; offset: number; length: number }>;
  };
}

function isAllowed(env: Env, chatId: number): boolean {
  if (!env.ALLOWED_CHAT_IDS) return true;
  const ids = env.ALLOWED_CHAT_IDS.split(",").map((s) => s.trim());
  return ids.includes(String(chatId));
}

async function sendTelegram(
  botToken: string,
  chatId: number,
  text: string,
  parseMode?: string
): Promise<boolean> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function sendReply(
  botToken: string,
  chatId: number,
  text: string
): Promise<void> {
  const converted = toTelegramMarkdown(text);
  const chunks = chunkText(converted);
  for (const chunk of chunks) {
    const sent = await sendTelegram(botToken, chatId, chunk, "HTML");
    if (!sent) {
      // Fallback: send as plain text
      await sendTelegram(botToken, chatId, chunk);
    }
  }
}

async function sendTyping(
  botToken: string,
  chatId: number
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

/** Per-chat model override (in-memory) */
const modelOverrides = new Map<number, string>();

function extractCommand(
  text: string,
  entities?: Array<{ type: string; offset: number; length: number }>
): { command: string; args: string } | null {
  if (!entities) return null;
  const cmdEntity = entities.find((e) => e.type === "bot_command" && e.offset === 0);
  if (!cmdEntity) return null;
  const command = text.slice(1, cmdEntity.length).split("@")[0];
  const args = text.slice(cmdEntity.length).trim();
  return { command, args };
}

async function handleCommand(
  env: Env,
  chatId: number,
  command: string,
  args: string
): Promise<void> {
  switch (command) {
    case "start":
    case "help":
      await sendReply(
        env.TELEGRAM_BOT_TOKEN,
        chatId,
        "Commands:\n/help — show this message\n/model <name> — switch model\n/reset — clear conversation history"
      );
      break;
    case "reset":
      clearHistory(chatId);
      modelOverrides.delete(chatId);
      await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "Conversation cleared.");
      break;
    case "model":
      if (!args) {
        const current = modelOverrides.get(chatId) ?? "default";
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `Current model: ${current}\nUsage: /model <name>`);
      } else {
        modelOverrides.set(chatId, args);
        await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `Model set to: ${args}`);
      }
      break;
  }
}

async function handleMessage(env: Env, chatId: number, text: string): Promise<void> {
  await sendTyping(env.TELEGRAM_BOT_TOKEN, chatId);

  const history = getHistory(chatId);
  const userMsg: Message = { role: "user", content: text };
  const messages: Message[] = [...history, userMsg];

  try {
    const model = modelOverrides.get(chatId);
    const response = await complete(env, messages, model);

    appendToHistory(chatId, userMsg, {
      role: "assistant",
      content: response,
    });

    await sendReply(env.TELEGRAM_BOT_TOKEN, chatId, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, `Error: ${message}`);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = update.message;
    if (!message?.text) {
      return new Response("OK", { status: 200 });
    }

    const chatId = message.chat.id;
    if (!isAllowed(env, chatId)) {
      ctx.waitUntil(
        sendTelegram(env.TELEGRAM_BOT_TOKEN, chatId, "Sorry, this bot is not available for this chat.")
      );
      return new Response("OK", { status: 200 });
    }

    const cmd = extractCommand(message.text, message.entities);

    if (cmd) {
      // Commands are fast — still process in background but they're quick
      ctx.waitUntil(handleCommand(env, chatId, cmd.command, cmd.args));
    } else {
      // LLM calls run in background — return 200 immediately
      ctx.waitUntil(handleMessage(env, chatId, message.text));
    }

    return new Response("OK", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
