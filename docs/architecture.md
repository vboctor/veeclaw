# Architecture

VeeClaw is a TypeScript/Bun application whose production runtime is a set of
Cloudflare Workers. The Agent Worker is the orchestration boundary. Channel
workers and the CLI submit conversations to it; the Agent assembles context,
runs the model/tool loop, and owns durable memory and schedules.

```text
CLI (Ink) ───────────────┐
                         │ HTTPS + bearer token
Telegram Gateway ───────┼──> Agent Worker
                         │       │
                         │       ├── AGENT_KV (memory + schedules)
                         │       ├── LLM Gateway ──> OpenRouter
                         │       └── Connector Workers
                         │            ├── Google
                         │            ├── GitHub
                         │            ├── MantisHub
                         │            └── Todoist
                         │
                         └── Cloudflare cron: every minute
```

The production diagram is also available as [architecture.png](architecture.png).
Service bindings are internal Worker-to-Worker calls. Connector and gateway
workers do not need public endpoints for Agent traffic.

## Request lifecycle

### Interactive completion

1. The CLI or Telegram gateway creates a `CompletionRequest` containing the
   message history. The CLI can also run directly against OpenRouter for local
   use; the deployed path uses the Agent Worker.
2. The Agent authenticates the request with `AGENT_TOKEN`.
3. The selected orchestrator (`vee`) is loaded. Its prompt, the available
   specialist list, active skill prompts, current time, and stored memory are
   added to the model context.
4. Skill definitions and the `delegate_to_agent` definition are attached to the
   request. The Agent chooses the configured model for the orchestrator.
5. The Agent calls the LLM Gateway. If the model returns tool calls, the Agent
   executes connector, internal, and delegation calls, appends their results to
   the message list, and repeats the loop (up to 10 rounds for normal
   completion).
6. The final response is returned. Working-memory updates and fact extraction
   run with `waitUntil()` so they do not delay the primary response.

Streaming uses the same prompt and memory preparation but forwards the LLM
Gateway SSE stream to the caller. The Agent tees the stream and processes the
captured text for background memory updates.

### Scheduled execution

The Agent's one-minute cron trigger calls the heartbeat. The heartbeat first
reads a `schedule:next_run` sentinel from KV. If nothing is due, it stops after
that cheap read. Otherwise it scans schedules, filters by due time, active
hours, and `maxRuns`, advances `nextRun` before dispatch to avoid duplicate
execution, and dispatches due entries in parallel.

Prompt schedules re-enter the Agent pipeline and may use tools. Action
schedules execute a fixed operation without an LLM call. One-shot entries are
removed after dispatch; recurring entries advance their cron time and record
run status and counters.

## Trust and data boundaries

- The Agent owns orchestration, prompts, memory, scheduling, and tool routing.
- The LLM Gateway owns the OpenRouter API key and translates the shared request
  shape to OpenRouter's chat-completions format.
- Each connector owns its provider credentials and API calls. The Agent sends
  tool requests to connectors over service bindings.
- `AGENT_KV` stores Agent memory and schedules. Connector-specific storage is
  separate: Google uses `TOOL_CACHE` for OAuth access tokens and MantisHub uses
  `CONNECTOR_KV` for instance configuration.
- Telegram validates its webhook secret and can restrict access with
  `ALLOWED_CHAT_IDS`. Agent endpoints require a bearer token.

The separation limits credential exposure: the Agent needs connector bindings,
but does not need to hold the provider tokens used by those connectors; the
LLM Gateway needs the OpenRouter key, but does not own tool execution.

## Source map

- Agent entrypoint and HTTP routes: `workers/agent/src/index.ts`
- Agent configuration: `workers/agent/src/agents/loader.ts`
- LLM/tool/delegation loop: `workers/agent/src/agents/runner.ts`
- Skill registry: `workers/agent/src/skills/registry.ts`
- Tool routing: `workers/agent/src/tools/execute.ts`
- Memory: `workers/agent/src/memory/`
- Scheduling: `workers/agent/src/schedule/`
- Worker bindings and cron: `workers/agent/wrangler.jsonc`
