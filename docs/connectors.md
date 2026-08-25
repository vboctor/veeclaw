# Connectors

Connectors are dedicated Cloudflare Workers that isolate provider API clients
and credentials from the Agent. The Agent exposes tool schemas to the model,
then maps each tool name to a connector binding and internal route. Connector
workers accept POST requests on their internal `/v1/...` routes and return JSON.

## Current connectors

- **Google** — Gmail search/read/send/draft/unread/star, Calendar list/get/create/update/delete, and Drive list/search/get/download. OAuth refresh tokens are stored as Worker secrets; access tokens are cached in `TOOL_CACHE`.
- **GitHub** — repository and organization lookup, pull requests and reviews, issues, and code search/tree/get. Uses `GITHUB_TOKEN`.
- **MantisHub** — issues, notes, assignment/status/monitoring, wiki, filters, search, changelog, and roadmap. Per-instance configuration is held in `CONNECTOR_KV`.
- **Todoist** — tasks, projects, comments, completion/reopening, and reminders. Uses `TODOIST_TOKEN`.

The implementation and route switch for each connector are in
`workers/connectors/<name>/src/index.ts`; provider-specific auth and API code
is in the neighboring modules.

## Adding a connector

1. Create `workers/connectors/<name>/` with a Worker entrypoint, auth module,
   provider API modules, package metadata, and `wrangler.jsonc`.
2. Add the connector binding to `workers/agent/wrangler.jsonc` and its `Env`
   interface in `workers/agent/src/index.ts`.
3. Define tool schemas and route maps in `workers/agent/src/tools/`.
4. Add a skill definition and prompt in `workers/agent/src/skills/`, then
   register it in `workers/agent/src/skills/registry.ts`.
5. Assign the skill to an agent in that agent's `agent.yml`.
6. Add setup/auth and deploy scripts when the connector needs them.
7. Document credential ownership, destructive operations, and confirmation
   behavior.

Keep provider secrets in the connector. The Agent should only receive the
minimum JSON arguments and result needed for tool execution.
