Use Bun instead of Node.js, npm, pnpm, or vite.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv

## Project

SCAF (Serverless Cloud Agent Framework) — CLI & LLM Gateway.

- Runtime: Bun + TypeScript
- TUI: Ink (React for terminal)
- LLM Gateway: Provider-agnostic, starting with OpenRouter
- Secrets stored at `~/.scaf/secrets.json`

## Structure

```
src/
  index.tsx          — Entry point
  app.tsx            — Root Ink component (chat layout)
  components/        — Ink UI components
  llm/               — LLM Gateway (types, gateway factory, providers)
  secrets/           — Secrets management (~/.scaf/secrets.json)
```

## Commands

- `bun run start` — Launch the TUI
- `bun run dev` — Launch with --watch
- `bun test` — Run tests
