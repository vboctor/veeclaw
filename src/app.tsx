import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { MessageList } from "./components/message-list.tsx";
import { ChatInput } from "./components/chat-input.tsx";
import { Setup } from "./components/setup.tsx";
import { createGateway } from "./llm/gateway.ts";
import { hasSecret } from "./secrets/secrets.ts";
import type { Message } from "./llm/types.ts";

const SYSTEM_PROMPT = `You are SCAF, a helpful AI assistant. Be concise and direct.`;

const MODEL_ALIASES: Record<string, string> = {
  "haiku": "anthropic/claude-haiku-4.5",
  "sonnet": "anthropic/claude-sonnet-4",
  "opus": "anthropic/claude-opus-4",
  "gpt4o": "openai/gpt-4o",
  "gpt4o-mini": "openai/gpt-4o-mini",
  "gemini-flash": "google/gemini-2.0-flash-001",
  "gemini-pro": "google/gemini-2.5-pro-preview-06-05",
};

function resolveModel(input: string): string {
  return MODEL_ALIASES[input.toLowerCase()] ?? input;
}

// Reverse lookup: full model ID → alias
const MODEL_ALIAS_REVERSE = Object.fromEntries(
  Object.entries(MODEL_ALIASES).map(([alias, id]) => [id, alias])
);

function displayModel(model: string): string {
  return MODEL_ALIAS_REVERSE[model] ?? model;
}

export function App() {
  const { exit } = useApp();
  const [isSetup, setIsSetup] = useState(
    !hasSecret("agent_url") && !hasSecret("openrouter_api_key")
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("anthropic/claude-haiku-4.5");
  const [info, setInfo] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  const handleSubmit = useCallback(
    async (text: string) => {
      if (text === "/quit" || text === "/exit") {
        exit();
        return;
      }

      if (text === "/clear") {
        setMessages([]);
        setError(null);
        setInfo(null);
        return;
      }

      if (text === "/model") {
        const aliases = Object.entries(MODEL_ALIASES)
          .map(([alias, id]) => `  ${alias} → ${id}`)
          .join("\n");
        setInfo(
          `Current model: ${model}\n\nUsage: /model <name-or-alias>\n\nAliases:\n${aliases}\n\nOr use any OpenRouter model ID directly, e.g. /model meta-llama/llama-3-70b-instruct`
        );
        return;
      }

      if (text.startsWith("/model ")) {
        const arg = text.slice(7).trim();
        if (!arg) return;
        const resolved = resolveModel(arg);
        setModel(resolved);
        setInfo(`Model set to: ${resolved}`);
        return;
      }

      setError(null);
      setInfo(null);
      const userMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");

      try {
        const gateway = createGateway();
        const allMessages = [...messages, userMessage];
        let fullContent = "";

        for await (const chunk of gateway.stream({
          system: SYSTEM_PROMPT,
          messages: allMessages,
          model,
        })) {
          fullContent += chunk;
          setStreamingContent(fullContent);
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullContent },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setStreamingContent(null);
        setIsStreaming(false);
      }
    },
    [messages, model, exit]
  );

  if (isSetup) {
    return <Setup onComplete={() => setIsSetup(false)} />;
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
        <Text bold color="green">
          SCAF
        </Text>
        <Text color="gray">
          {displayModel(model)} · /model · /clear · /quit
        </Text>
      </Box>

      <MessageList messages={messages} streamingContent={streamingContent} />

      {info && (
        <Box paddingX={1}>
          <Text color="cyan">{info}</Text>
        </Box>
      )}

      {error && (
        <Box paddingX={1}>
          <Text color="red" bold>
            Error: {error}
          </Text>
        </Box>
      )}

      <ChatInput onSubmit={handleSubmit} disabled={isStreaming} />

      <Box paddingX={1}>
        <Text color="white">
          model: {displayModel(model)} · /model to change
        </Text>
      </Box>
    </Box>
  );
}
