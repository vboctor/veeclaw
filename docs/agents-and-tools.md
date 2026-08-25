# Agents, skills, and tools

VeeClaw separates three concepts:

- An **agent** is a persona/configuration: identity, model, prompt, and skill
  IDs.
- A **skill** is a capability bundle: prompt instructions, tool definitions,
  connector routes, and optional OpenRouter plugins.
- A **tool** is a function schema presented to the model and either handled by
  the Agent or routed to a connector.

## Agent configurations

Agent YAML and prompt files live in `workers/agent/src/agents/<id>/`. The loader
imports them at build time; there is no database-backed agent registry or
runtime discovery.

| Agent | Role | Skills |
| --- | --- | --- |
| Vee | Main orchestrator | Drive, GitHub |
| Scout | Web research | Web search, Drive |
| Atlas | Travel planning | Web search |
| Caleb | Scheduling and calendar | Cron, Calendar |
| Emily | Email | Gmail |
| Cody | Code review | GitHub |
| Manny | Tasks and issues | MantisHub, Todoist, GitHub Issues |

Vee is selected for normal requests. Specialist agents are invoked through
Vee's `delegate_to_agent` tool; they are not separate long-running processes.

## Delegation flow

1. Vee decides that a specialist is appropriate and emits a delegation tool
   call with an agent ID, task, and optional instructions.
2. The Agent validates and runs the named specialist using its configured
   prompt, model, and skills.
3. The specialist can perform its own tool calls, including connector calls.
4. Its result is returned as a tool message to Vee, which produces the final
   user-facing answer.

Multiple delegation calls in one model response are executed in parallel. The
system therefore supports parallel specialist work within a request, but it
does not implement a persistent swarm, shared specialist memory, or an
independent agent scheduler.

## Skill resolution

`workers/agent/src/skills/registry.ts` maps skill IDs to static definitions. The
registry combines the selected skills' tools, routes, connector bindings,
prompts, and plugins. The current skills are Gmail, Calendar, Drive, web
search, cron, GitHub, GitHub Issues, MantisHub, and Todoist.

The orchestrator's tool set is resolved for each request. Internal schedule
tools are handled by the Agent; connector tools are routed according to the
skill's route map; web search is enabled as an OpenRouter plugin.

## Tool loop

`workers/agent/src/agents/runner.ts` repeats these steps until the model returns
text or the round limit is reached:

1. Call the LLM Gateway.
2. Partition returned tool calls into connector, internal, and delegation
   calls.
3. Execute each group (the groups run concurrently).
4. Append assistant tool calls and tool results to the request messages.
5. Call the model again.

Normal Agent completions allow up to 10 rounds. Tool failures are returned to
the model as structured error text so it can recover or explain the problem.
