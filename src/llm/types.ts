export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  system?: string;
  messages: Message[];
  tools?: Tool[];
  model?: string;
  stream?: boolean;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface LLMGateway {
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  stream(req: CompletionRequest): AsyncIterable<string>;
}
