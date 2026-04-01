import type { Tool } from "@veeclaw/shared";
import { parse } from "yaml";
import {
  GMAIL_TOOLS,
  GMAIL_TOOL_ROUTES,
  CALENDAR_TOOLS,
  CALENDAR_TOOL_ROUTES,
  DRIVE_TOOLS,
  DRIVE_TOOL_ROUTES,
} from "../tools/google.ts";
import {
  GITHUB_TOOLS,
  GITHUB_TOOL_ROUTES,
} from "../tools/github.ts";
import {
  MANTISHUB_TOOLS,
  MANTISHUB_TOOL_ROUTES,
} from "../tools/mantishub.ts";
import { SCHEDULE_TOOLS } from "../tools/schedule.ts";

import GMAIL_SKILL_MD from "./gmail/SKILL.md";
import CALENDAR_SKILL_MD from "./calendar/SKILL.md";
import DRIVE_SKILL_MD from "./drive/SKILL.md";
import WEB_SEARCH_SKILL_MD from "./web_search/SKILL.md";
import CRON_SKILL_MD from "./cron/SKILL.md";
import GITHUB_SKILL_MD from "./github/SKILL.md";
import MANTISHUB_SKILL_MD from "./mantishub/SKILL.md";

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  /** Full instructions injected into the agent's prompt when the skill is active. */
  prompt: string;
  tools: Tool[];
  routes: Record<string, string>;
  /** Connector binding name for routing tool calls (e.g., "GOOGLE_CONNECTOR"). */
  connector?: string;
  plugins?: string[];
  /** Tool names handled internally (not routed to a connector). */
  internalTools?: string[];
}

interface SkillFrontmatter {
  name: string;
  description: string;
}

function parseSkillMd(raw: string): {
  name: string;
  description: string;
  prompt: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { name: "", description: "", prompt: raw.trim() };
  }
  const frontmatter = parse(match[1]) as SkillFrontmatter;
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    prompt: match[2].trim(),
  };
}

const gmailSkill = parseSkillMd(GMAIL_SKILL_MD);
const calendarSkill = parseSkillMd(CALENDAR_SKILL_MD);
const driveSkill = parseSkillMd(DRIVE_SKILL_MD);
const webSearchSkill = parseSkillMd(WEB_SEARCH_SKILL_MD);
const cronSkill = parseSkillMd(CRON_SKILL_MD);
const githubSkill = parseSkillMd(GITHUB_SKILL_MD);
const mantishubSkill = parseSkillMd(MANTISHUB_SKILL_MD);

const SKILLS: Record<string, SkillConfig> = {
  gmail: {
    id: "gmail",
    name: gmailSkill.name,
    description: gmailSkill.description,
    prompt: gmailSkill.prompt,
    tools: GMAIL_TOOLS,
    routes: GMAIL_TOOL_ROUTES,
    connector: "GOOGLE_CONNECTOR",
  },
  calendar: {
    id: "calendar",
    name: calendarSkill.name,
    description: calendarSkill.description,
    prompt: calendarSkill.prompt,
    tools: CALENDAR_TOOLS,
    routes: CALENDAR_TOOL_ROUTES,
    connector: "GOOGLE_CONNECTOR",
  },
  drive: {
    id: "drive",
    name: driveSkill.name,
    description: driveSkill.description,
    prompt: driveSkill.prompt,
    tools: DRIVE_TOOLS,
    routes: DRIVE_TOOL_ROUTES,
    connector: "GOOGLE_CONNECTOR",
  },
  web_search: {
    id: "web_search",
    name: webSearchSkill.name,
    description: webSearchSkill.description,
    prompt: webSearchSkill.prompt,
    tools: [],
    routes: {},
    plugins: ["web"],
  },
  cron: {
    id: "cron",
    name: cronSkill.name,
    description: cronSkill.description,
    prompt: cronSkill.prompt,
    tools: SCHEDULE_TOOLS,
    routes: {},
    internalTools: [
      "schedule_list",
      "schedule_get",
      "schedule_create",
      "schedule_update",
      "schedule_delete",
    ],
  },
  github: {
    id: "github",
    name: githubSkill.name,
    description: githubSkill.description,
    prompt: githubSkill.prompt,
    tools: GITHUB_TOOLS,
    routes: GITHUB_TOOL_ROUTES,
    connector: "GITHUB_CONNECTOR",
  },
  mantishub: {
    id: "mantishub",
    name: mantishubSkill.name,
    description: mantishubSkill.description,
    prompt: mantishubSkill.prompt,
    tools: MANTISHUB_TOOLS,
    routes: MANTISHUB_TOOL_ROUTES,
    connector: "MANTISHUB_CONNECTOR",
  },
};

export function resolveSkills(skillIds: string[]): {
  tools: Tool[];
  routes: Record<string, string>;
  connectorMap: Record<string, string>;
  plugins: string[];
  prompts: string[];
  internalTools: string[];
} {
  const tools: Tool[] = [];
  const routes: Record<string, string> = {};
  const connectorMap: Record<string, string> = {};
  const plugins: string[] = [];
  const prompts: string[] = [];
  const internalTools: string[] = [];

  for (const id of skillIds) {
    const skill = SKILLS[id];
    if (!skill) continue;

    tools.push(...skill.tools);
    Object.assign(routes, skill.routes);

    // Map each tool in this skill to its connector binding
    if (skill.connector) {
      for (const toolName of Object.keys(skill.routes)) {
        connectorMap[toolName] = skill.connector;
      }
    }

    if (skill.prompt) {
      prompts.push(skill.prompt);
    }
    if (skill.plugins) {
      for (const p of skill.plugins) {
        if (!plugins.includes(p)) plugins.push(p);
      }
    }
    if (skill.internalTools) {
      internalTools.push(...skill.internalTools);
    }
  }

  return { tools, routes, connectorMap, plugins, prompts, internalTools };
}
