# VeeClaw documentation

This directory is the maintained technical documentation for VeeClaw. The
repository root [README](../README.md) is the short project overview and quick
start; these pages explain how the deployed system works.

## Start here

- [Architecture](architecture.md) — system boundaries, request flows, and
  Cloudflare bindings.
- [Components](components.md) — the responsibilities and source locations of
  the CLI, workers, shared package, memory, and scheduler.
- [Agents, skills, and tools](agents-and-tools.md) — how personas are loaded,
  how delegation works, and how tool calls are routed.
- [Connectors](connectors.md) — connector responsibilities, supported
  integrations, authentication, and service-boundary rules.
- [Operations](operations.md) — local development, setup, deployment, secrets,
  and common maintenance tasks.

## Documentation layout

`docs/` contains user- and developer-facing documentation that should describe
the current implementation.

`docs/internal/` contains working material such as proposals, design notes,
and implementation plans. Internal documents are intentionally not treated as
public API or deployment guarantees.

When behavior changes, update the relevant public page in the same change. Add
an internal note when the change introduces a meaningful design decision or a
follow-up plan.
