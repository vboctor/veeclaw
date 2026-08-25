# Architecture notes

Status: working reference

## Current constraints

- Agent configurations and skills are bundled at build time.
- Service bindings provide the internal connector boundary.
- KV stores the Agent's consolidated memory document and schedule collection.
- The heartbeat uses a next-run sentinel to avoid a full schedule scan when no
  task is due.
- Delegation is an in-request LLM workflow, not a durable job queue.

## Follow-up areas

- Decide whether Telegram conversation history should move from process-local
  memory to durable storage.
- Define a versioning/migration strategy for the consolidated memory KV shape.
- Add contract tests for skill route maps and connector binding coverage.
- Document and test retry/idempotency expectations for connector writes and
  scheduled actions.
- Revisit whether specialist delegation needs explicit depth, timeout, or cost
  budgets as the number of agents grows.
