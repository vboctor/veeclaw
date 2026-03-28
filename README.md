# SCAF — Serverless Cloud Agent Framework

A modular, provider-agnostic LLM framework with a terminal chat interface, a Cloudflare Worker agent with 3-tier memory and scheduling, and a Telegram bot — all powered by Bun and TypeScript.

```text
                      CLI TUI (Ink/React)
                            │
Telegram Bot ───┐           │
                ▼           ▼
          Telegram Gateway → Agent → LLM Gateway → OpenRouter
                             (3-tier memory via KV)
                             (scheduling via KV + cron)
                             (dispatch: Telegram, HTTP)
```

## Features

- **CLI TUI** — Interactive terminal chat with real-time streaming, markdown rendering, and model switching
- **Agent Worker** — Cloudflare Worker that owns memory, system prompt, scheduling, and dispatch
- **LLM Gateway Worker** — Cloudflare Worker passthrough to OpenRouter (internal only, no public access)
- **Telegram Gateway Worker** — Telegram bot that relays messages through the Agent
- **Natural-language scheduling** — Create, list, update, and delete schedules through conversation
- **Provider-agnostic** — OpenRouter gives access to Claude, GPT-4o, Gemini, and more
- **Shared types** — Common interfaces in `@scaf/shared` used across all components

## Project Structure

```text
src/                          CLI TUI
  app.tsx                     Root chat component
  components/                 Ink UI components
  llm/                        LLM client (agent or direct)
  secrets/                    ~/.scaf/secrets.json management

packages/shared/              Shared types (@scaf/shared)

workers/
  agent/                      Cloudflare Worker — Agent (memory, prompts, scheduling, dispatch)
    src/memory/               3-tier memory system (KV-backed)
    src/schedule/             Schedule store, heartbeat, dispatch, extraction, context injection
    src/prompts/              System prompt
  llm-gateway/                Cloudflare Worker — LLM passthrough to OpenRouter (internal only)
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

1. **Agent Worker** — enter the URL and token of your deployed Agent worker
2. **Direct OpenRouter** — enter your OpenRouter API key directly

Secrets are stored at `~/.scaf/secrets.json` (file permissions 0600).

## Scripts

```bash
# CLI
bun run start              # Launch the CLI TUI
bun run dev                # Launch with --watch for development
bun test                   # Run tests

# Workers — local development
bun run dev:agent          # Run Agent worker locally (wrangler dev)
bun run dev:gateway        # Run LLM gateway locally (wrangler dev)
bun run dev:telegram       # Run Telegram gateway locally (wrangler dev)

# Workers — deploy to Cloudflare
bun run deploy             # Deploy all workers
bun run deploy:agent       # Deploy Agent worker only
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

## Deploying the Workers

### 1. LLM Gateway (deploy first)

The LLM Gateway is a passthrough to OpenRouter. It holds the API key and is only accessible via service binding from the Agent — no public HTTP access.

```bash
cd workers/llm-gateway

# Set secrets
wrangler secret put OPENROUTER_API_KEY

# Deploy
wrangler deploy
```

### 2. Agent Worker

The Agent is the central worker. It owns memory, system prompt injection, scheduling, and dispatch. It has a cron trigger (every minute) for the heartbeat scheduler.

```bash
cd workers/agent

# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put AGENT_TOKEN          # optional, for authenticating CLI requests

# Deploy
wrangler deploy
```

**Routes:**

- `POST /v1/complete` — non-streaming completion (with memory + system prompt)
- `POST /v1/stream` — streaming completion (SSE)
- `POST /v1/dispatch` — execute a schedule entry (prompt or action)
- `GET/POST/PUT/DELETE /v1/schedules[/:id]` — schedule CRUD

### 3-Tier Memory

The Agent automatically manages conversation memory via Cloudflare KV (`AGENT_KV`):

| Tier | What it stores | TTL |
|---|---|---|
| **Working** | Last 20 message pairs | 1 day |
| **Summary** | Compressed conversation history | 30 days |
| **Facts** | Extracted user preferences and info | 90 days |

Memory is injected into the system prompt and updated in the background after each response.

### 3. Telegram Gateway

```bash
cd workers/telegram-gateway

# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put AGENT_TOKEN          # optional, must match Agent's AGENT_TOKEN

# Deploy
wrangler deploy
```

Register the webhook with Telegram:

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

## Scheduling

The Agent enables time-based task execution through natural language. Users create, list, update, and delete schedules by chatting with the assistant (via Telegram or CLI). The Agent extracts scheduling commands from the LLM response and stores them in KV. A cron trigger (every minute) runs the heartbeat dispatcher.

### How It Works

1. **User** asks to schedule something via natural language
2. **Agent** injects the current datetime and user timezone into the system prompt
3. **LLM** responds with a confirmation and embeds a `<schedule_command>` block
4. **Agent** strips the command block from the response, parses it, and stores the entry in `AGENT_KV`
5. **Agent cron** (every minute) reads all entries from KV, finds those due within a ±30 second window, and dispatches them
6. For **prompt** mode entries: runs the prompt through the full Agent pipeline (memory + LLM), then sends the response to Telegram
7. For **action** mode entries: executes inline (send a fixed Telegram message or make an HTTP request)
8. **Recurring** entries get their `nextRun` recomputed from the cron expression; **one-shot** entries are deleted after firing

### Schedule Types

| Type | Description |
|---|---|
| **Recurring** | Fires on a cron pattern. `nextRun` is recomputed after each firing. |
| **One-shot** | Fires once at a specific time, then self-deletes. KV TTL auto-cleans orphans. |

### Execution Modes

| Mode | Description | Cost |
|---|---|---|
| **prompt** | Sends the prompt to the LLM for a full reasoning response, then delivers to Telegram. | LLM tokens + Worker CPU |
| **action** | Executes a fixed operation inline (send message, HTTP request) without touching the LLM. | ~1ms Worker CPU only |

### Run Tracking

Every schedule entry tracks:

| Field | Description |
|---|---|
| `maxRuns` | Maximum number of times this entry should fire. Omit for unlimited (`*`). |
| `runCount` | Total number of times this entry has fired so far. |
| `successCount` | Number of runs that completed successfully. |
| `failureCount` | Number of runs that failed (LLM error, HTTP error, etc.). |
| `lastRun` | Timestamp of the most recent run. |
| `lastRunStatus` | `"success"` or `"failure"` for the most recent run. |

When a recurring entry reaches its `maxRuns` limit, it is automatically deleted.

### Scheduling Examples

- **Daily at 9am**: "Remind me to review my inbox every morning at 9am" — recurring, cron `0 9 * * *`
- **Yearly date**: "Wish me happy birthday every July 15 at 9am" — recurring, cron `0 9 15 7 *`
- **Weekly**: "Give me a weekly summary every Monday at noon" — recurring, cron `0 12 * * 1`
- **One-shot**: "Remind me to call the dentist tomorrow at 4pm" — one-shot with computed `nextRunIso`
- **Relative delay**: "Remind me to stretch in 2 hours" — one-shot, current time + 2 hours
- **Limited runs**: "Remind me to take medication every morning at 8am for 7 days" — recurring with `maxRuns: 7`

### Managing Schedules via Natural Language

- **List**: "What are my scheduled tasks?"
- **Update**: "Change my morning reminder to 8am instead of 9am"
- **Delete**: "Cancel the water reminder"

### Schedule REST API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/schedules` | List all schedule entries |
| `GET` | `/v1/schedules/:id` | Get a single entry by ID |
| `POST` | `/v1/schedules` | Create a new entry |
| `PUT` | `/v1/schedules/:id` | Update an existing entry |
| `DELETE` | `/v1/schedules/:id` | Delete an entry |

### Timing Accuracy

The Agent heartbeat runs every minute with a ±30 second matching window. Scheduled events may fire up to 30 seconds early or late.

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
- **Agent as central hub** — the Agent owns memory, prompts, scheduling, and dispatch; the LLM Gateway is a dumb passthrough
- **LLM Gateway isolation** — the OpenRouter API key is isolated to the LLM Gateway, accessible only via service binding
- **Single KV namespace** — memory (`memory:*`) and schedules (`schedule:*`) share one KV namespace with prefix separation
- **Memory as system prompt** — memory tiers are injected into the system prompt, not duplicated as messages
- **Background processing** — memory extraction and summarization run via `waitUntil()` and never block responses
- **Thin relay pattern** — the Telegram gateway contains no LLM logic; it delegates everything to the Agent
- **Scheduling via conversation** — the LLM emits structured `<schedule_command>` blocks; the Agent extracts and processes them transparently
- **Heartbeat dispatcher** — pure KV read + dispatch; LLM reasoning only happens at dispatch time for prompt-mode entries
