import { Bot, type Context } from "grammy";
import type { Message } from "@scaf/shared";
import { complete, type AgentEnv } from "./agent-client.ts";
import { getHistory, appendToHistory, clearHistory } from "./history.ts";
import { chunkText } from "./chunks.ts";

export interface BotEnv extends AgentEnv {
  TELEGRAM_BOT_TOKEN: string;
  ALLOWED_CHAT_IDS: string;
}

function isAllowed(env: BotEnv, chatId: number): boolean {
  if (!env.ALLOWED_CHAT_IDS) return true; // empty = allow all
  const ids = env.ALLOWED_CHAT_IDS.split(",").map((s) => s.trim());
  return ids.includes(String(chatId));
}

/** Per-chat model override (in-memory) */
const modelOverrides = new Map<number, string>();

export function createBot(env: BotEnv): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", (ctx) =>
    ctx.reply(
      "Welcome to SCAF! Send me a message and I'll respond using the LLM gateway.\n\n" +
        "Commands:\n" +
        "/help — show this message\n" +
        "/model <name> — switch model\n" +
        "/reset — clear conversation history"
    )
  );

  bot.command("help", (ctx) =>
    ctx.reply(
      "Commands:\n" +
        "/help — show this message\n" +
        "/model <name> — switch model (e.g. /model anthropic/claude-sonnet-4)\n" +
        "/reset — clear conversation history"
    )
  );

  bot.command("reset", (ctx) => {
    const chatId = ctx.chat.id;
    clearHistory(chatId);
    modelOverrides.delete(chatId);
    return ctx.reply("Conversation cleared.");
  });

  bot.command("model", (ctx) => {
    const model = ctx.match?.trim();
    if (!model) {
      const current = modelOverrides.get(ctx.chat.id) ?? "default";
      return ctx.reply(`Current model: ${current}\nUsage: /model <name>`);
    }
    modelOverrides.set(ctx.chat.id, model);
    return ctx.reply(`Model set to: ${model}`);
  });

  bot.on("message:text", async (ctx: Context) => {
    const chatId = ctx.chat!.id;
    const text = ctx.message!.text!;

    if (!isAllowed(env, chatId)) {
      return ctx.reply("Sorry, this bot is not available for this chat.");
    }

    await ctx.api.sendChatAction(chatId, "typing");

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

      const chunks = chunkText(response);
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await ctx.reply(`Error: ${message}`);
    }
  });

  return bot;
}
