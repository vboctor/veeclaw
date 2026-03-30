import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { setSecret } from "../secrets/secrets.ts";

interface SetupProps {
  onComplete: () => void;
}

type SetupMode = "choose" | "agent" | "agent-token" | "openrouter";

export function Setup({ onComplete }: SetupProps) {
  const [mode, setMode] = useState<SetupMode>("choose");
  const [value, setValue] = useState("");
  const [agentUrl, setAgentUrl] = useState("");

  const handleChoose = (input: string) => {
    const trimmed = input.trim().toLowerCase();
    if (trimmed === "1" || trimmed === "agent") {
      setMode("agent");
      setValue("");
    } else if (trimmed === "2" || trimmed === "direct") {
      setMode("openrouter");
      setValue("");
    }
  };

  const handleAgentUrl = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setAgentUrl(trimmed);
    setSecret("agent_url", trimmed);
    setMode("agent-token");
    setValue("");
  };

  const handleAgentToken = (input: string) => {
    const trimmed = input.trim();
    if (trimmed) {
      setSecret("agent_token", trimmed);
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
        VeeClaw Setup
      </Text>
      <Text> </Text>

      {mode === "choose" && (
        <>
          <Text>Choose your LLM provider:</Text>
          <Text> </Text>
          <Text>  <Text bold>1</Text> — Agent Worker (recommended for deployment)</Text>
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

      {mode === "agent" && (
        <>
          <Text>Enter your VeeClaw Agent Worker URL:</Text>
          <Text> </Text>
          <Box>
            <Text bold color="cyan">
              Agent URL:{" "}
            </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleAgentUrl}
              placeholder="https://veeclaw-agent.your-account.workers.dev"
            />
          </Box>
        </>
      )}

      {mode === "agent-token" && (
        <>
          <Text>
            Agent URL set to: <Text color="green">{agentUrl}</Text>
          </Text>
          <Text> </Text>
          <Text>Enter agent auth token (press Enter to skip if none):</Text>
          <Text> </Text>
          <Box>
            <Text bold color="cyan">
              Token:{" "}
            </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleAgentToken}
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
