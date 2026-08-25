# Components

## CLI

`src/` contains the Ink/React terminal UI. It renders chat and markdown, owns
the local setup flow, and selects one of two gateways:

- `agent` sends authenticated requests to `/v1/complete` or `/v1/stream` on an
  Agent Worker.
- `openrouter` sends requests directly to OpenRouter for a lightweight local
  mode.

Local secrets are stored in `~/.veeclaw/secrets.json`; the CLI never needs
provider connector credentials.

## Agent Worker

`workers/agent/` is the central Worker. Its HTTP API is authenticated and
currently exposes:

- `POST /v1/complete` — completion with memory, skills, tools, and delegation.
- `POST /v1/stream` — SSE completion stream.
- `POST /v1/dispatch` — dispatch a schedule entry.
- `GET/PUT /v1/memory` — inspect or replace Agent memory.
- `GET/POST/PUT/DELETE /v1/schedules[/:id]` — schedule CRUD.

The Worker also implements the `scheduled` handler used by the one-minute cron
trigger.

## LLM Gateway

`workers/llm-gateway/` is deliberately thin. It accepts the shared
`CompletionRequest`, adds OpenRouter authentication, handles provider-specific
system-content and prompt-cache formatting, and returns normalized
`CompletionResponse` values or SSE. It does not execute tools or maintain
conversation state.

## Telegram Gateway

`workers/telegram-gateway/` is a channel adapter. It validates Telegram's
webhook secret, optionally filters chat IDs, maintains a small per-chat
in-memory history, forwards messages to the Agent, converts markdown to
Telegram HTML, and chunks long replies to Telegram's message limit. `/start`,
`/help`, `/model`, and `/reset` are handled locally.

The in-memory history is a channel convenience, not durable Agent memory; it
is lost when the Worker instance is evicted. Durable continuity comes from the
Agent's KV-backed memory.

## Shared package

`packages/shared/` defines request/response, message, tool-call, and schedule
types plus shared schedule and Telegram-markdown helpers. All Workers use these
types to keep the internal protocol consistent.

## Memory

`workers/agent/src/memory/` stores one KV document with three conceptual tiers:

- **Working memory** — recent user/assistant exchanges.
- **Summary** — compressed older context.
- **Facts** — extracted durable preferences and user information.

Memory is injected into the system prompt rather than replayed as ordinary
conversation messages. Updates, summarization, and fact extraction are
best-effort background work; failures do not fail the user's completion.

## Scheduling

`workers/agent/src/schedule/` handles schedule storage, natural-language
schedule tools, timezone conversion, active-hour checks, heartbeat dispatch,
and run tracking. Schedule records can be recurring or one-shot and can run in
`prompt` or `action` mode. See [Architecture](architecture.md) for the
heartbeat sequence and the root README for examples.
