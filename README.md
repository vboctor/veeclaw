# SCAF — Serverless Cloud Agent Framework

A modular, provider-agnostic LLM framework with a terminal chat interface, a Cloudflare Worker gateway with 3-tier memory, and a Telegram bot — all powered by Bun and TypeScript.

```text
                      CLI TUI (Ink/React)
                            │
Telegram Bot ───┐           │
                ▼           ▼
          Telegram Gateway → LLM Gateway → OpenRouter
                             (3-tier memory via KV)
```

## Features

- **CLI TUI** — Interactive terminal chat with real-time streaming, markdown rendering, and model switching
- **LLM Gateway Worker** — Cloudflare Worker proxy to OpenRouter with 3-tier memory (working, summary, facts)
- **Telegram Gateway Worker** — Telegram bot that relays messages through the LLM gateway
- **Provider-agnostic** — OpenRouter gives access to Claude, GPT-4o, Gemini, and more
- **Shared types** — Common interfaces in `@scaf/shared` used across all components

## Project Structure

```text
src/                          CLI TUI
  app.tsx                     Root chat component
  components/                 Ink UI components
  llm/                        LLM client (gateway or direct)
  secrets/                    ~/.scaf/secrets.json management

packages/shared/              Shared types (@scaf/shared)

workers/
  llm-gateway/                Cloudflare Worker — LLM proxy + memory
    src/memory/               3-tier memory system (KV-backed)
  telegram-gateway/           Cloudflare Worker — Telegram bot
```

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (for deploying Workers)
- An [OpenRouter](https://openrouter.ai) API key
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (for the Telegram gateway)

## Quick Start

```bash
# Install dependencies
bun install

# Run the CLI
bun run start
```

On first launch, the setup wizard prompts you to choose a connection mode:

1. **Gateway Worker** — enter the URL and token of your deployed LLM gateway
2. **Direct OpenRouter** — enter your OpenRouter API key directly

Secrets are stored at `~/.scaf/secrets.json` (file permissions 0600).

## Scripts

```bash
# CLI
bun run start              # Launch the CLI TUI
bun run dev                # Launch with --watch for development
bun test                   # Run tests

# Workers — local development
bun run dev:gateway        # Run LLM gateway locally (wrangler dev)
bun run dev:telegram       # Run Telegram gateway locally (wrangler dev)

# Workers — deploy to Cloudflare
bun run deploy             # Deploy all workers
bun run deploy:gateway     # Deploy LLM gateway only
bun run deploy:telegram    # Deploy Telegram gateway only
```

## CLI Commands

| Command | Description |
|---|---|
| `/model` | List available models |
| `/model <alias or id>` | Switch model (e.g. `/model sonnet`, `/model openai/gpt-4o`) |
| `/clear` | Clear conversation history |
| `/quit` or `/exit` | Exit |

**Model aliases:** `haiku`, `sonnet`, `opus`, `gpt4o`, `gpt4o-mini`, `gemini-flash`, `gemini-pro`

## Deploying the LLM Gateway

```bash
cd workers/llm-gateway

# Create the KV namespace for memory
wrangler kv:namespace create memory
# Copy the ID into wrangler.jsonc

# Set secrets
wrangler secret put OPENROUTER_API_KEY
wrangler secret put GATEWAY_TOKEN    # optional, for auth

# Deploy
wrangler deploy
```

**Routes:**

- `POST /v1/complete` — non-streaming completion
- `POST /v1/stream` — streaming completion (SSE)

### 3-Tier Memory

The gateway automatically manages conversation memory via Cloudflare KV:

| Tier | What it stores | TTL |
|---|---|---|
| **Working** | Last 20 message pairs | 1 day |
| **Summary** | Compressed conversation history | 30 days |
| **Facts** | Extracted user preferences and info | 90 days |

Memory is injected into the system prompt and updated in the background after each response.

## Deploying the Telegram Gateway

1. Create a bot with [@BotFather](https://t.me/BotFather) and note the token
2. Generate a random webhook secret (e.g. `openssl rand -hex 32`)

```bash
cd workers/telegram-gateway

# Update LLM_GATEWAY_URL in wrangler.jsonc to your deployed gateway URL
# Optionally set ALLOWED_CHAT_IDS to restrict access

# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put LLM_GATEWAY_TOKEN    # optional, must match gateway's GATEWAY_TOKEN

# Deploy
wrangler deploy
```

1. Register the webhook with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://scaf-telegram-gateway.<your-subdomain>.workers.dev",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

**Bot commands:**

- `/start` — Welcome message
- `/help` — List commands
- `/model <name>` — Switch model for this chat
- `/reset` — Clear conversation history

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun + TypeScript |
| CLI TUI | React 19 + Ink 6 |
| Markdown | marked v15 + marked-terminal |
| Telegram bot | grammY |
| Serverless | Cloudflare Workers + KV |
| LLM API | OpenRouter (OpenAI-compatible) |

## Architecture Decisions

- **No SDK** — raw `fetch()` to OpenRouter; no OpenAI SDK dependency
- **Bun-first** — uses Bun for runtime, testing, and package management
- **Memory as system prompt** — memory tiers are injected into the system prompt, not duplicated as messages
- **Background processing** — memory extraction and summarization run via `waitUntil()` and never block responses
- **Thin relay pattern** — the Telegram gateway contains no LLM logic; it delegates everything to the LLM gateway
