# SCAF — Serverless Cloud Agent Framework

A modular, provider-agnostic LLM framework with a terminal chat interface, a Cloudflare Worker gateway with 3-tier memory, and a Telegram bot — all powered by Bun and TypeScript.

```text
                      CLI TUI (Ink/React)
                            │
Telegram Bot ───┐           │
                ▼           ▼
          Telegram Gateway → LLM Gateway → OpenRouter
                             (3-tier memory via KV)
                             (schedule management via KV)
                                    ▲
          Scheduler ────────────────┘
          (cron: every 5 min)
```

## Features

- **CLI TUI** — Interactive terminal chat with real-time streaming, markdown rendering, and model switching
- **LLM Gateway Worker** — Cloudflare Worker proxy to OpenRouter with 3-tier memory (working, summary, facts)
- **Telegram Gateway Worker** — Telegram bot that relays messages through the LLM gateway
- **Scheduler Worker** — Heartbeat cron (every 5 min) that dispatches due schedule entries from KV
- **Natural-language scheduling** — Create, list, update, and delete schedules through conversation
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
  llm-gateway/                Cloudflare Worker — LLM proxy + memory + scheduling
    src/memory/               3-tier memory system (KV-backed)
    src/schedule/             Schedule store, extraction, and context injection
  telegram-gateway/           Cloudflare Worker — Telegram bot
  scheduler/                  Cloudflare Worker — Heartbeat cron (every 5 min)
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
bun run dev:scheduler      # Run scheduler locally (wrangler dev)

# Workers — deploy to Cloudflare
bun run deploy             # Deploy all workers
bun run deploy:gateway     # Deploy LLM gateway only
bun run deploy:telegram    # Deploy Telegram gateway only
bun run deploy:scheduler   # Deploy scheduler only
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

## Scheduling

The scheduler enables time-based task execution through natural language. Users create, list, update, and delete schedules by chatting with the assistant (via Telegram or CLI). The LLM gateway extracts scheduling commands from the assistant's response and forwards them to the scheduler worker via service binding. The scheduler worker exclusively owns the `SCHEDULER_KV` namespace — the gateway never accesses it directly.

### How It Works

1. **User** asks to schedule something via natural language
2. **LLM gateway** injects the current datetime into the system prompt so the LLM can compute absolute times
3. **LLM** responds with a confirmation and embeds a `<schedule_command>` block
4. **Gateway** strips the command block from the response, parses it, and calls the **scheduler worker** via service binding to create/update/delete the entry
5. **Scheduler worker** (cron `*/5 * * * *`) reads all entries from its KV store, finds those due within a +/-2.5 min window, and dispatches them
6. For **prompt** mode entries: calls the LLM gateway with the stored prompt, then sends the response to Telegram
7. For **action** mode entries: executes inline (send a fixed message or make an HTTP request)
8. **Recurring** entries get their `nextRun` recomputed from the cron expression; **one-shot** entries are deleted after firing

The LLM gateway also proxies `/v1/schedules` requests to the scheduler via service binding, so the REST API remains accessible through the gateway URL.

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

When a recurring entry reaches its `maxRuns` limit, it is automatically deleted. When listing schedules, runs are displayed as `runCount/maxRuns` (e.g., `3/5`) or `runCount/*` for unlimited.

### Supported Scheduling Patterns

#### Every morning at 9am

> "Remind me to review my inbox every morning at 9am"

Creates a **recurring** entry with cron `0 9 * * *`. The scheduler fires daily at 9am, sends the prompt to the LLM, and delivers the response to Telegram.

#### On a specific date each year (e.g., birthday)

> "Wish me happy birthday every July 15 at 9am"

Creates a **recurring** entry with cron `0 9 15 7 *`. The day-of-month and month fields pin it to July 15; it fires every year at 9am.

#### Every Monday at 12pm

> "Give me a weekly summary every Monday at noon"

Creates a **recurring** entry with cron `0 12 * * 1`. Day-of-week `1` is Monday.

#### Once tomorrow at 4pm

> "Remind me to call the dentist tomorrow at 4pm"

Creates a **one-shot** entry. The LLM knows the current datetime (injected into its context) and computes the absolute `nextRunIso` for the next day at 16:00. After firing, the entry is automatically deleted.

#### Once after a relative delay (e.g., 2 hours)

> "Remind me to stretch in 2 hours"

Creates a **one-shot** entry with `nextRunIso` set to current time + 2 hours. The LLM computes the absolute time from the current datetime in its system prompt. The scheduler picks it up on the next 5-minute heartbeat after the target time.

#### Run a task a fixed number of times

> "Remind me to take my medication every morning at 8am for the next 7 days"

Creates a **recurring** entry with cron `0 8 * * *` and `maxRuns: 7`. The scheduler fires daily at 8am and increments the run count. After the 7th run, the entry is automatically deleted. The user can check progress at any time — the schedule listing shows runs as `3/7` (3 completed out of 7).

### Managing Schedules via Natural Language

- **List**: "What are my scheduled tasks?" — the gateway loads all entries from KV and injects them into the LLM context. The listing includes name, frequency, last run (with success/failure status), run count vs max runs, and success/failure totals.
- **View details**: "What does the daily-standup schedule do?" — the LLM sees the full entry including the prompt or action and describes it.
- **Check progress**: "How many times has the medication reminder run?" — shows `runCount/maxRuns` and success/failure breakdown.
- **Update**: "Change my morning reminder to 8am instead of 9am" — the LLM emits an update command with the new cron expression. Can also update `maxRuns` (e.g., "extend it to 14 days").
- **Delete**: "Cancel the water reminder" — the LLM emits a delete command targeting that schedule ID.

### Schedule REST API

The LLM gateway exposes endpoints for programmatic schedule management:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/schedules` | List all schedule entries |
| `GET` | `/v1/schedules/:id` | Get a single entry by ID |
| `POST` | `/v1/schedules` | Create a new entry |
| `PUT` | `/v1/schedules/:id` | Update an existing entry |
| `DELETE` | `/v1/schedules/:id` | Delete an entry |

### Deploying the Scheduler

```bash
cd workers/scheduler

# Create the KV namespace (owned exclusively by the scheduler)
wrangler kv:namespace create SCHEDULER_KV
# Copy the ID into workers/scheduler/wrangler.jsonc

# Set the default Telegram chat ID in wrangler.jsonc vars
# Set secrets
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put LLM_GATEWAY_TOKEN    # optional, must match gateway's GATEWAY_TOKEN

# Deploy the scheduler first (gateway depends on it via service binding)
wrangler deploy

# Then redeploy the gateway so its service binding resolves
cd ../llm-gateway
wrangler deploy
```

The LLM gateway connects to the scheduler via a service binding (`SCHEDULER`). It never has direct access to `SCHEDULER_KV`. All schedule reads and writes go through the scheduler's REST API.

### Timing Accuracy

The scheduler heartbeat runs every 5 minutes with a +/-2.5 minute matching window. Scheduled events may fire up to 2.5 minutes early or late. This is acceptable for personal agent use cases (reminders, briefings, digests).

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
- **Scheduling via conversation** — the LLM emits structured `<schedule_command>` blocks; the gateway extracts and processes them transparently
- **Heartbeat dispatcher** — pure KV read + dispatch; no LLM call in the scheduler itself (LLM reasoning only happens at dispatch time for prompt-mode entries)
