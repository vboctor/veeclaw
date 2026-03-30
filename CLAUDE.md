# VeeClaw Development Guide

Only commit, push, or deploy when explicitly asked by the user.

Use Bun instead of Node.js, npm, pnpm, or vite.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv

## Project

VeeClaw — Personal AI Agent on Cloudflare Workers.

- Runtime: Bun + TypeScript
- TUI: Ink (React for terminal)
- LLM Gateway: Provider-agnostic, starting with OpenRouter
- Secrets stored at `~/.veeclaw/secrets.json`

## Structure

```text
src/                          — CLI TUI
  index.tsx                   — Entry point
  app.tsx                     — Root Ink component (chat layout)
  components/                 — Ink UI components
  llm/                        — LLM Gateway (types, gateway factory, providers)
  secrets/                    — Secrets management (~/.veeclaw/secrets.json)
packages/shared/              — Shared types (@veeclaw/shared)
workers/
  agent/                      — Cloudflare Worker — Agent (memory, prompts, scheduling, dispatch)
  llm-gateway/                — Cloudflare Worker — LLM passthrough to OpenRouter (internal only)
  telegram-gateway/           — Cloudflare Worker — Telegram bot
  connectors/google/          — Cloudflare Worker — Google Connector (Gmail, Calendar, Drive)
```

## Commands

- `bun run start` — Launch the TUI
- `bun run dev` — Launch with --watch
- `bun test` — Run tests
- `bun run dev:agent` — Run Agent worker locally
- `bun run dev:gateway` — Run LLM gateway locally
- `bun run dev:telegram` — Run Telegram gateway locally
- `bun run deploy` — Deploy all workers to Cloudflare
- `bun run deploy:agent` — Deploy Agent worker only
- `bun run deploy:gateway` — Deploy LLM gateway only
- `bun run deploy:telegram` — Deploy Telegram gateway only
- `bun run dev:google` — Run Google connector locally
- `bun run deploy:google` — Deploy Google connector only
- `bun run google-auth` — OAuth2 browser flow to authorize Google access
- `bun run setup` — Interactive setup: creates KV, deploys workers, pushes secrets, registers webhook
- `bun run undeploy` — Tear down all workers, KV namespaces, and Telegram webhook
