import { parse } from "yaml";

import VEE_YAML from "./vee/agent.yml";
import VEE_PROMPT from "./vee/prompt.md";
import SCOUT_YAML from "./scout/agent.yml";
import SCOUT_PROMPT from "./scout/prompt.md";
import ATLAS_YAML from "./atlas/agent.yml";
import ATLAS_PROMPT from "./atlas/prompt.md";
import CALEB_YAML from "./caleb/agent.yml";
import CALEB_PROMPT from "./caleb/prompt.md";
import EMILY_YAML from "./emily/agent.yml";
import EMILY_PROMPT from "./emily/prompt.md";
import CODY_YAML from "./cody/agent.yml";
import CODY_PROMPT from "./cody/prompt.md";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;
  skills: string[];
  prompt: string;
}

interface AgentYaml {
  id: string;
  name: string;
  description: string;
  model: string;
  skills?: string[];
}

function loadAgent(yamlStr: string, prompt: string): AgentConfig {
  const yaml = parse(yamlStr) as AgentYaml;
  return {
    id: yaml.id,
    name: yaml.name,
    description: yaml.description,
    model: yaml.model,
    skills: yaml.skills ?? [],
    prompt,
  };
}

const AGENTS: Record<string, AgentConfig> = {
  vee: loadAgent(VEE_YAML, VEE_PROMPT),
  scout: loadAgent(SCOUT_YAML, SCOUT_PROMPT),
  atlas: loadAgent(ATLAS_YAML, ATLAS_PROMPT),
  caleb: loadAgent(CALEB_YAML, CALEB_PROMPT),
  emily: loadAgent(EMILY_YAML, EMILY_PROMPT),
  cody: loadAgent(CODY_YAML, CODY_PROMPT),
};

export function getAgent(id: string): AgentConfig | undefined {
  return AGENTS[id];
}

/** Returns all agents except vee (the orchestrator). */
export function listAgents(): AgentConfig[] {
  return Object.values(AGENTS).filter((a) => a.id !== "vee");
}

export function getOrchestrator(): AgentConfig {
  return AGENTS.vee;
}
