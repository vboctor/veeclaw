# SCAF — Serverless Cloud Agent Framework

A modular, provider-agnostic LLM framework with a terminal chat interface, a Cloudflare Worker agent with 3-tier memory and scheduling, and a Telegram bot — all powered by Bun and TypeScript.

```text
                      CLI TUI (Ink/React)
                            │
Telegram Bot ───┐           │
                ▼           ▼
          Telegram Gateway → Agent → LLM Gateway → OpenRouter
                              ↕
                        Google Connector → Gmail, Calendar, Drive
                             (3-tier memory via KV)
                             (scheduling via KV + cron)
                             (tool calling with execution loop)
                             (dispatch: Telegram, HTTP)
```

## Features

- **CLI TUI** — Interactive terminal chat with real-time streaming, markdown rendering, and model switching
- **Agent Worker** — Cloudflare Worker that owns memory, system prompt, scheduling, tool calling, and dispatch
- **Google Connector** — Cloudflare Worker providing Gmail, Google Calendar, and Google Drive access via direct REST APIs
- **Tool calling** — LLM can invoke Google tools autonomously with a multi-round execution loop
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
    src/tools/                Tool definitions and execution (Google tools)
    src/prompts/              System prompt
  llm-gateway/                Cloudflare Worker — LLM passthrough to OpenRouter (internal only)
  telegram-gateway/           Cloudflare Worker — Telegram bot
  connectors/google/          Cloudflare Worker — Google Connector (Gmail, Calendar, Drive)
```

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (for deploying Workers)
- An [OpenRouter](https://openrouter.ai) API key
- A Telegram bot token from [@BotFather](https://t.me/BotFather) (for the Telegram gateway)
- A Google Cloud project with Gmail, Calendar, and Drive APIs enabled (for the Google Connector)

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
bun run dev:google         # Run Google Connector locally (wrangler dev)

# Workers — deploy to Cloudflare
bun run deploy             # Deploy all workers
bun run deploy:agent       # Deploy Agent worker only
bun run deploy:gateway     # Deploy LLM gateway only
bun run deploy:telegram    # Deploy Telegram gateway only
bun run deploy:google      # Deploy Google Connector only

# Google OAuth
bun run google-auth        # Run OAuth2 browser flow to authorize Google access
```

## CLI Commands

| Command | Description |
|---|---|
| `/model` | List available models |
| `/model <alias or id>` | Switch model (e.g. `/model sonnet`, `/model openai/gpt-4o`) |
| `/clear` | Clear conversation history |
| `/quit` or `/exit` | Exit |

**Model aliases:** `haiku`, `sonnet`, `opus`, `gpt4o`, `gpt4o-mini`, `gemini-flash`, `gemini-pro`

## Setup

### Quick setup (recommended)

```bash
bun install
cp .env.example .env    # fill in your API keys
bun run setup
```

The setup wizard detects existing state and only performs what's missing:

- Prompts for any secrets not yet in `.env`
- Creates KV namespaces (AGENT_KV and TOOL_CACHE, or reuses existing)
- Deploys all four workers
- Pushes secrets to Cloudflare (only missing ones)
- Registers the Telegram webhook

Re-run `bun run setup` at any time — it's incremental and safe to repeat. Use `bun run setup --force` to redo everything.

### Teardown

### Google Connector setup

The Google Connector requires a one-time OAuth2 authorization:

1. Create a Google Cloud project and enable **Gmail API**, **Google Calendar API**, and **Google Drive API**
2. Create an OAuth 2.0 Client ID (Desktop app type) and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
3. Run the OAuth flow:

```bash
bun run google-auth
```

This opens a browser for Google consent, exchanges the authorization code for a refresh token, and saves `GOOGLE_REFRESH_TOKEN` to `.env`. Works for both consumer (gmail.com) and Google Workspace accounts.

4. Run `bun run setup` to push the secrets to Cloudflare

### Teardown

To remove all deployed workers, KV namespaces, and the Telegram webhook:

```bash
bun run undeploy
```

Your `.env` is preserved so you can re-run `bun run setup` to redeploy.

### Manual setup

See each worker's `wrangler.jsonc` for required secrets and bindings. Secrets can be set individually with `wrangler secret put`.

## Worker Architecture

### Agent Worker

The Agent is the central worker. It owns memory, system prompt injection, scheduling, and dispatch. It has a cron trigger (every minute) for the heartbeat scheduler.

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

### Google Connector

The Google Connector (`workers/connectors/google/`) is a dedicated Cloudflare Worker that owns OAuth2 tokens and all Google API interactions. The Agent calls it via service binding — no public HTTP access.

**Gmail tools:** `gmail_search`, `gmail_read`, `gmail_send`, `gmail_draft`, `gmail_unread`
**Calendar tools:** `calendar_list`, `calendar_get`, `calendar_create`, `calendar_update`
**Drive tools:** `drive_list`, `drive_search`, `drive_get`, `drive_download`

OAuth2 access tokens are cached in the `TOOL_CACHE` KV namespace with a 55-minute TTL and automatically refreshed using the stored refresh token.

### Tool Calling

The Agent injects Google tool definitions into LLM requests using the OpenAI function-calling format. When the LLM responds with `tool_calls`, the Agent executes them against the Google Connector, feeds results back, and loops until the LLM produces a final text response (up to 5 rounds). Tool calling works in both interactive conversations and scheduled task dispatch.

### LLM Gateway

The LLM Gateway is a passthrough to OpenRouter. It holds the API key, passes through tool definitions and tool call results, and is only accessible via service binding from the Agent — no public HTTP access.

### Telegram Gateway

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
5. **Agent cron** (every minute) reads all entries from KV, finds those where `nextRun <= now`, and dispatches them
6. For **prompt** mode entries: runs the prompt through the full Agent pipeline (memory + LLM + tool calling), then sends the response to Telegram with a confirmation of any actions taken
7. For **action** mode entries: executes inline (send a fixed Telegram message or make an HTTP request) and confirms completion via Telegram
8. **Recurring** entries get their `nextRun` recomputed from the cron expression; **one-shot** entries are deleted after firing

### Schedule Types

| Type | Description |
|---|---|
| **Recurring** | Fires on a cron pattern. `nextRun` is recomputed after each firing. |
| **One-shot** | Fires once at a specific time, then self-deletes. Past-due one-shots are retried on the next heartbeat tick. |

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

The Agent heartbeat runs every minute. Scheduled events fire on the first heartbeat tick after their `nextRun` time, so they may be up to ~60 seconds late but are never missed.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun + TypeScript |
| CLI TUI | React 19 + Ink 6 |
| Markdown | marked v15 + marked-terminal |
| Telegram bot | grammY |
| Serverless | Cloudflare Workers + KV |
| LLM API | OpenRouter (OpenAI-compatible) |
| Google APIs | Direct REST (Gmail, Calendar, Drive) — no SDK |

## Architecture Decisions

- **No SDK** — raw `fetch()` to OpenRouter; no OpenAI SDK dependency
- **Bun-first** — uses Bun for runtime, testing, and package management
- **Agent as central hub** — the Agent owns memory, prompts, scheduling, tool calling, and dispatch; the LLM Gateway is a dumb passthrough
- **Connector pattern** — external service integrations are isolated in dedicated Workers (e.g. Google Connector), connected via service bindings
- **LLM Gateway isolation** — the OpenRouter API key is isolated to the LLM Gateway, accessible only via service binding
- **Google Connector isolation** — OAuth2 tokens and Google API calls are isolated to the Google Connector Worker with its own KV (TOOL_CACHE)
- **Two KV namespaces** — AGENT_KV for memory (`memory:*`) and schedules (`schedule:*`); TOOL_CACHE for OAuth2 token caching
- **Memory as system prompt** — memory tiers are injected into the system prompt, not duplicated as messages
- **Background processing** — memory extraction and summarization run via `waitUntil()` and never block responses
- **Thin relay pattern** — the Telegram gateway contains no LLM logic; it delegates everything to the Agent
- **Scheduling via conversation** — the LLM emits structured `<schedule_command>` blocks; the Agent extracts and processes them transparently
- **Tool execution loop** — LLM can invoke tools autonomously across multiple rounds; tool calls are routed to connectors via service bindings
- **Heartbeat dispatcher** — pure KV read + dispatch; LLM reasoning and tool calling only happen at dispatch time for prompt-mode entries; past-due entries are never missed
