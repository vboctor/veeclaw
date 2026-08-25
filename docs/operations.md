# Operations

## Local development

Install Bun, then run:

```bash
bun install
bun run start
bun test
```

Run a Worker locally with the corresponding `bun run dev:<component>` script.
Worker configuration, bindings, cron triggers, and required secrets are in
each Worker's `wrangler.jsonc`.

## Setup and deployment

The normal deployment path is:

```bash
cp .env.example .env
# fill in provider and deployment values
bun run setup
```

The setup script is incremental: it creates or reuses KV namespaces, deploys
Workers, pushes missing secrets, and registers the Telegram webhook. Deploy all
Workers explicitly with `bun run deploy`, or deploy one component with its
`bun run deploy:<component>` script.

OAuth helper scripts are available for Google, GitHub, MantisHub, and Todoist.
Never commit `.env`, Worker secrets, refresh tokens, or local CLI secrets.

## Teardown and state

`bun run undeploy` removes deployed Workers, KV namespaces, and the Telegram
webhook while preserving `.env` for a later setup. The `pull` and `push` scripts
are available for deployment state synchronization; inspect their behavior
before using them against a shared environment.

## Configuration checklist

- Agent: `AGENT_TOKEN`, `AGENT_KV`, service bindings, and Telegram dispatch
  values.
- LLM Gateway: `OPENROUTER_API_KEY`.
- Telegram: bot token, webhook secret, and optional allowed chat IDs.
- Google: OAuth client ID, client secret, and refresh token.
- GitHub: `GITHUB_TOKEN`.
- MantisHub: connector KV and instance configuration.
- Todoist: `TODOIST_TOKEN`.

## Operational characteristics

- Scheduled work has one-minute heartbeat resolution; a task can be about a
  minute late.
- Prompt schedules consume model tokens; action schedules do not call the
  model.
- Agent memory work is best effort and asynchronous.
- Telegram chat history is process-local and bounded; Agent KV is the durable
  memory layer.
- Agent and Telegram requests can time out on long-running multi-tool work;
  keep scheduled prompts and connector operations appropriately scoped.
