import { webhookCallback } from "grammy";
import { createBot, type BotEnv } from "./bot.ts";

interface Env extends BotEnv {
  TELEGRAM_WEBHOOK_SECRET: string;
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

    // Validate webhook secret
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const bot = createBot(env);
    const handler = webhookCallback(bot, "cloudflare-mod", {
      timeoutMilliseconds: 55_000,
    });

    return handler(request);
  },
} satisfies ExportedHandler<Env>;
