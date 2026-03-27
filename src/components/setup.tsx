import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { setSecret } from "../secrets/secrets.ts";

interface SetupProps {
  onComplete: () => void;
}

export function Setup({ onComplete }: SetupProps) {
  const [apiKey, setApiKey] = useState("");

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSecret("openrouter_api_key", trimmed);
    onComplete();
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">
        SCAF Setup
      </Text>
      <Text> </Text>
      <Text>
        No OpenRouter API key found. Get one at{" "}
        <Text color="cyan" underline>
          https://openrouter.ai/keys
        </Text>
      </Text>
      <Text> </Text>
      <Box>
        <Text bold color="cyan">
          API Key:{" "}
        </Text>
        <TextInput
          value={apiKey}
          onChange={setApiKey}
          onSubmit={handleSubmit}
          placeholder="sk-or-v1-..."
          mask="*"
        />
      </Box>
    </Box>
  );
}
