import type {
  CompletionRequest,
  CompletionResponse,
  Message,
} from "@veeclaw/shared";
import type { Env } from "../index.ts";
import { executeToolCalls } from "../tools/execute.ts";

export interface RunAgentOptions {
  request: CompletionRequest;
  env: Env;
  routes: Record<string, string>;
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
  const {
    env,
    routes,
    maxRounds = 5,
    onDelegateCall,
    internalToolHandlers,
  } = opts;
  let currentReq = opts.request;
  let data!: CompletionResponse;

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
    const connectorResults =
      connectorCalls.length > 0
        ? await executeToolCalls(connectorCalls, env.GOOGLE_CONNECTOR, routes)
        : [];

    // Execute internal tool calls
    const internalResults: Message[] = await Promise.all(
      internalCalls.map(async (call) => {
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
        return {
          role: "tool" as const,
          content: result,
          tool_call_id: call.id,
        };
      })
    );

    // Execute delegation calls
    const delegateResults: Message[] = [];
    for (const call of delegateCalls) {
      const args = JSON.parse(call.function.arguments) as {
        agent: string;
        task: string;
        instructions?: string;
      };
      let result: string;
      if (onDelegateCall) {
        result = await onDelegateCall(
          args.agent,
          args.task,
          args.instructions
        );
      } else {
        result = JSON.stringify({
          error: "Delegation not supported for this agent",
        });
      }
      delegateResults.push({
        role: "tool",
        content: result,
        tool_call_id: call.id,
      });
    }

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

  return data;
}
