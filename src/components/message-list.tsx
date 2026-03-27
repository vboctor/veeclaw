import React from "react";
import { Box } from "ink";
import { MessageView } from "./message.tsx";
import type { Message } from "../llm/types.ts";

interface MessageListProps {
  messages: Message[];
  streamingContent: string | null;
}

export function MessageList({ messages, streamingContent }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, i) => (
        <MessageView key={i} message={msg} />
      ))}
      {streamingContent !== null && (
        <MessageView
          message={{ role: "assistant", content: streamingContent || "..." }}
          isStreaming
        />
      )}
    </Box>
  );
}
