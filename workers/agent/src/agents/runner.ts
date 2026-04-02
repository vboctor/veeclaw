import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@veeclaw/shared";
import type { Env } from "../index.ts";
import { executeToolCalls } from "../tools/execute.ts";

export interface AgentUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCacheWriteTokens: number;
  totalCacheReadTokens: number;
  rounds: number;
}

export interface AgentResult {
  response: CompletionResponse;
  usage: AgentUsage;
}

export interface RunAgentOptions {
  request: CompletionRequest;
  env: Env;
  routes: Record<string, string>;
  connectorMap: Record<string, string>;
  maxRounds?: number;
  onDelegateCall?: (
    agentId: string,
    task: string,
    instructions?: string
  ) => Promise<string>;
  /** Tool name -> handler for tools executed internally (not routed to a connector). */
  internalToolHandlers?: Record<string, (args: string) => Promise<string>>;
}

export async function runAgent(
  opts: RunAgentOptions
): Promise<CompletionResponse> {
  const { response } = await runAgentWithUsage(opts);
  return response;
}

export async function runAgentWithUsage(
  opts: RunAgentOptions
): Promise<AgentResult> {
  const {
    env,
    routes,
    connectorMap,
    maxRounds = 5,
    onDelegateCall,
    internalToolHandlers,
  } = opts;
  let currentReq = opts.request;
  let data!: CompletionResponse;

  const usage: AgentUsage = {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCacheWriteTokens: 0,
    totalCacheReadTokens: 0,
    rounds: 0,
  };

  for (let round = 0; round < maxRounds; round++) {
    const response = await env.LLM_GATEWAY.fetch(
      "https://internal/v1/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentReq),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM gateway error (${response.status}): ${text}`);
    }

    data = (await response.json()) as CompletionResponse;
    usage.rounds = round + 1;

    // Accumulate usage and log cache metrics
    if (data.usage) {
      const u = data.usage;
      usage.totalPromptTokens += u.prompt_tokens;
      usage.totalCompletionTokens += u.completion_tokens;
      usage.totalCacheWriteTokens += u.cache_creation_input_tokens ?? 0;
      usage.totalCacheReadTokens += u.cache_read_input_tokens ?? 0;

      const cacheTotal = (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      const hitPct = cacheTotal > 0
        ? Math.round(((u.cache_read_input_tokens ?? 0) / cacheTotal) * 100)
        : 0;
      console.log(
        `[llm] round=${round} prompt=${u.prompt_tokens} completion=${u.completion_tokens} cache_write=${u.cache_creation_input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} hit=${hitPct}%`
      );
    }

    if (!data.tool_calls?.length) break;

    // Partition tool calls by type
    const delegateCalls = data.tool_calls.filter(
      (c) => c.function.name === "delegate_to_agent"
    );
    const internalCalls = data.tool_calls.filter(
      (c) =>
        c.function.name !== "delegate_to_agent" &&
        internalToolHandlers?.[c.function.name]
    );
    const connectorCalls = data.tool_calls.filter(
      (c) =>
        c.function.name !== "delegate_to_agent" &&
        !internalToolHandlers?.[c.function.name]
    );

    // Execute connector-routed tool calls
    const connectors: Record<string, Fetcher> = {};
    if (env.GOOGLE_CONNECTOR) connectors.GOOGLE_CONNECTOR = env.GOOGLE_CONNECTOR;
    if (env.GITHUB_CONNECTOR) connectors.GITHUB_CONNECTOR = env.GITHUB_CONNECTOR;
    if (env.MANTISHUB_CONNECTOR) connectors.MANTISHUB_CONNECTOR = env.MANTISHUB_CONNECTOR;
    if (env.TODOIST_CONNECTOR) connectors.TODOIST_CONNECTOR = env.TODOIST_CONNECTOR;

    // Execute all tool types in parallel
    const [connectorResults, internalResults, delegateResults] = await Promise.all([
      // Connector-routed tool calls
      connectorCalls.length > 0
        ? executeToolCalls(connectorCalls, connectors, connectorMap, routes)
        : Promise.resolve([]),

      // Internal tool calls
      Promise.all(
        internalCalls.map(async (call): Promise<Message> => {
          const handler = internalToolHandlers![call.function.name];
          let result: string;
          try {
            result = await handler(call.function.arguments);
          } catch (err) {
            result = JSON.stringify({
              error:
                err instanceof Error ? err.message : "Internal tool execution failed",
            });
          }
          return { role: "tool", content: result, tool_call_id: call.id };
        })
      ),

      // Delegation calls (now parallel)
      Promise.all(
        delegateCalls.map(async (call): Promise<Message> => {
          const args = JSON.parse(call.function.arguments) as {
            agent: string;
            task: string;
            instructions?: string;
          };
          let result: string;
          if (onDelegateCall) {
            result = await onDelegateCall(args.agent, args.task, args.instructions);
          } else {
            result = JSON.stringify({
              error: "Delegation not supported for this agent",
            });
          }
          return { role: "tool", content: result, tool_call_id: call.id };
        })
      ),
    ]);

    const assistantMsg: Message = {
      role: "assistant",
      content: data.content || "",
      tool_calls: data.tool_calls,
    };

    currentReq = {
      ...currentReq,
      messages: [
        ...currentReq.messages,
        assistantMsg,
        ...connectorResults,
        ...internalResults,
        ...delegateResults,
      ],
    };
  }

  return { response: data, usage };
}
