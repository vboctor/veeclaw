import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { setSecret } from "../secrets/secrets.ts";

interface SetupProps {
  onComplete: () => void;
}

type SetupMode = "choose" | "gateway" | "gateway-token" | "openrouter";

export function Setup({ onComplete }: SetupProps) {
  const [mode, setMode] = useState<SetupMode>("choose");
  const [value, setValue] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("");

  const handleChoose = (input: string) => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === "1" || trimmed === "gateway") {
      setMode("gateway");
      setValue("");
    } else if (trimmed === "2" || trimmed === "direct") {
      setMode("openrouter");
      setValue("");
    }
  };

  const handleGatewayUrl = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setGatewayUrl(trimmed);
    setSecret("gateway_url", trimmed);
    setMode("gateway-token");
    setValue("");
  };

  const handleGatewayToken = (input: string) => {
    const trimmed = input.trim();
    if (trimmed) {
      setSecret("gateway_token", trimmed);
    }
    onComplete();
  };

  const handleOpenRouterKey = (input: string) => {
    const trimmed = input.trim();
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

      {mode === "choose" && (
        <>
          <Text>Choose your LLM provider:</Text>
          <Text> </Text>
          <Text>  <Text bold>1</Text> — Gateway Worker (recommended for deployment)</Text>
          <Text>  <Text bold>2</Text> — Direct OpenRouter (local development)</Text>
          <Text> </Text>
          <Box>
            <Text bold color="cyan">
              Choice:{" "}
            </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleChoose}
              placeholder="1 or 2"
            />
          </Box>
        </>
      )}

      {mode === "gateway" && (
        <>
          <Text>Enter your SCAF LLM Gateway Worker URL:</Text>
          <Text> </Text>
          <Box>
            <Text bold color="cyan">
              Gateway URL:{" "}
            </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleGatewayUrl}
              placeholder="https://scaf-llm-gateway.your-account.workers.dev"
            />
          </Box>
        </>
      )}

      {mode === "gateway-token" && (
        <>
          <Text>
            Gateway URL set to: <Text color="green">{gatewayUrl}</Text>
          </Text>
          <Text> </Text>
          <Text>Enter gateway auth token (press Enter to skip if none):</Text>
          <Text> </Text>
          <Box>
            <Text bold color="cyan">
              Token:{" "}
            </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleGatewayToken}
              mask="*"
            />
          </Box>
        </>
      )}

      {mode === "openrouter" && (
        <>
          <Text>
            Get an API key at{" "}
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
              value={value}
              onChange={setValue}
              onSubmit={handleOpenRouterKey}
              placeholder="sk-or-v1-..."
              mask="*"
            />
          </Box>
        </>
      )}
    </Box>
  );
}
