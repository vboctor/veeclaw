import type { Tool, CacheSegment, CompletionRequest } from "@veeclaw/shared";
import type { Env } from "../index.ts";
import { getAgent, listAgents } from "../agents/loader.ts";
import { resolveSkills } from "../skills/registry.ts";
import { runAgent } from "../agents/runner.ts";
import { buildScheduleToolHandlers } from "./schedule.ts";

export const DELEGATE_TOOL: Tool = {
  type: "function",
  function: {
    name: "delegate_to_agent",
    description:
      "Delegate a task to a specialist agent. The agent runs independently with its own tools and returns its final response.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Agent ID to delegate to",
        },
        task: {
          type: "string",
          description: "The task or question for the agent",
        },
        instructions: {
          type: "string",
          description:
            "Additional instructions or context to inject into the agent's prompt",
        },
      },
      required: ["agent", "task"],
    },
  },
};

function buildTimeContext(): string {
  const now = new Date();
  now.setSeconds(0, 0);
  const pdt = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  return `Current time: ${now.toISOString()} | Local: ${pdt.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })} ${pdt.toLocaleTimeString("en-US", { hour12: true })} PT`;
}

/** Build the dynamic agent listing for Vee's system prompt. */
export function buildAgentListing(): string {
  const agents = listAgents();
  const lines = agents.map((a) => `- **${a.id}**: ${a.description}`);
  return `## Agents\n${lines.join("\n")}`;
}

export async function handleDelegation(
  agentId: string,
  task: string,
  instructions: string | undefined,
  env: Env
): Promise<string> {
  const agent = getAgent(agentId);
  if (!agent) {
    return JSON.stringify({ error: `Unknown agent: ${agentId}` });
  }

  const { tools, routes, connectorMap, plugins, prompts, internalTools } =
    resolveSkills(agent.skills);

  // Segment 1: static prefix (cached) — agent prompt + skills
  const staticParts = [agent.prompt];
  if (prompts.length > 0) {
    staticParts.push(...prompts);
  }

  const segments: CacheSegment[] = [
    { text: staticParts.join("\n\n"), cache_control: { type: "ephemeral" } },
  ];

  // Segment 2: dynamic suffix (uncached) — time context + orchestrator instructions
  const dynamicParts = [buildTimeContext()];
  if (instructions) {
    dynamicParts.push(`---\n\nAdditional instructions from the orchestrator:\n${instructions}`);
  }
  segments.push({ text: dynamicParts.join("\n\n") });

  // Build internal tool handlers for skills that need them
  let internalToolHandlers: Record<string, (args: string) => Promise<string>> | undefined;
  if (internalTools.length > 0) {
    internalToolHandlers = {};
    // Schedule tools need KV access
    const scheduleHandlers = buildScheduleToolHandlers(env.AGENT_KV);
    for (const name of internalTools) {
      if (scheduleHandlers[name]) {
        internalToolHandlers[name] = scheduleHandlers[name];
      }
    }
  }

  const request: CompletionRequest = {
    system: segments,
    messages: [{ role: "user", content: task }],
    tools: tools.length > 0 ? tools : undefined,
    model: agent.model,
    plugins: plugins.length > 0 ? plugins : undefined,
  };

  const result = await runAgent({
    request,
    env,
    routes,
    connectorMap,
    internalToolHandlers,
    // No onDelegateCall — sub-agents cannot delegate further
  });

  return result.content;
}
