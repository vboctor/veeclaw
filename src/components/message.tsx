import React from "react";
import { Text, Box } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import type { Message as MessageType } from "../llm/types.ts";

const marked = new Marked(markedTerminal() as any);

function renderMarkdown(content: string): string {
  try {
    return (marked.parse(content) as string).trimEnd();
  } catch {
    return content;
  }
}

interface MessageProps {
  message: MessageType;
  isStreaming?: boolean;
}

export function MessageView({ message, isStreaming }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color={isUser ? "cyan" : "green"}>
        {isUser ? "You" : "Assistant"}
        {isStreaming ? " ..." : ""}
      </Text>
      <Box marginLeft={2}>
        {isUser ? (
          <Text>{message.content}</Text>
        ) : (
          <Text>{renderMarkdown(message.content)}</Text>
        )}
      </Box>
    </Box>
  );
}
