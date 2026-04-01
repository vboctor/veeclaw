import type { Tool, CompletionRequest } from "@veeclaw/shared";
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
  const pdt = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  return `Current datetime: ${now.toISOString()} | User's local time: ${pdt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} ${pdt.toLocaleTimeString("en-US", { hour12: true })} (America/Los_Angeles).`;
}

/** Build the dynamic agent listing for Vee's system prompt. */
export function buildAgentListing(): string {
  const agents = listAgents();
  const lines = agents.map((a) => `- **${a.id}**: ${a.description}`);
  return `## Available Agents\n\nYou can delegate tasks to these specialist agents using the \`delegate_to_agent\` tool:\n\n${lines.join("\n")}\n\nDelegate when a task requires an agent's specialty. For simple questions you can answer directly, respond without delegating.`;
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

  const { tools, routes, plugins, prompts, internalTools } = resolveSkills(
    agent.skills
  );

  let system = agent.prompt;
  if (prompts.length > 0) {
    system += `\n\n${prompts.join("\n\n")}`;
  }
  system += `\n\n${buildTimeContext()}`;
  if (instructions) {
    system += `\n\n---\n\nAdditional instructions from the orchestrator:\n${instructions}`;
  }

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
    system,
    messages: [{ role: "user", content: task }],
    tools: tools.length > 0 ? tools : undefined,
    model: agent.model,
    plugins: plugins.length > 0 ? plugins : undefined,
  };

  const result = await runAgent({
    request,
    env,
    routes,
    internalToolHandlers,
    // No onDelegateCall — sub-agents cannot delegate further
  });

  return result.content;
}
