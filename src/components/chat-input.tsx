import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface ChatInputProps {
  onSubmit: (value: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSubmit, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setValue("");
    onSubmit(trimmed);
  };

  return (
    <Box borderStyle="single" borderColor={disabled ? "gray" : "cyan"} paddingX={1}>
      <Text color={disabled ? "gray" : "cyan"} bold>
        {"❯ "}
      </Text>
      {disabled ? (
        <Text color="gray">Thinking...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Send a message..."
        />
      )}
    </Box>
  );
}
