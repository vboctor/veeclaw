import React, { useState, useCallback } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { MessageList } from "./components/message-list.tsx";
import { ChatInput } from "./components/chat-input.tsx";
import { Setup } from "./components/setup.tsx";
import { createGateway } from "./llm/gateway.ts";
import { hasSecret } from "./secrets/secrets.ts";
import type { Message } from "./llm/types.ts";

const SYSTEM_PROMPT = `You are SCAF, a helpful AI assistant. Be concise and direct.`;

export function App() {
  const { exit } = useApp();
  const [isSetup, setIsSetup] = useState(!hasSecret("openrouter_api_key"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        return;
      }

      setError(null);
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
    [messages, exit]
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
          /clear · /quit · Ctrl+C
        </Text>
      </Box>

      <MessageList messages={messages} streamingContent={streamingContent} />

      {error && (
        <Box paddingX={1}>
          <Text color="red" bold>
            Error: {error}
          </Text>
        </Box>
      )}

      <ChatInput onSubmit={handleSubmit} disabled={isStreaming} />
    </Box>
  );
}
