// Schedule Entry types — shared between LLM gateway and scheduler worker

export type ScheduleEntry = PromptScheduleEntry | ActionScheduleEntry;

interface BaseScheduleEntry {
  id: string;

  // Timing
  type: "recurring" | "one-shot";
  nextRun: number; // Unix timestamp ms
  cron?: string; // For recurring: standard 5-field cron expression

  // Optional fire window
  activeHours?: {
    start: number; // Hour in local time (0–23), inclusive
    end: number; // Hour in local time (0–23), exclusive
    timezone: string; // IANA timezone, e.g. "America/Los_Angeles"
  };

  // Run limits
  maxRuns?: number; // Total allowed runs. Omit or undefined = unlimited.

  // Housekeeping
  label: string;
  createdAt: number;
  lastRun?: number;
  lastRunStatus?: "success" | "failure";
  runCount: number;
  successCount: number;
  failureCount: number;
}

export interface PromptScheduleEntry extends BaseScheduleEntry {
  mode: "prompt";
  event: {
    type: string; // e.g. "morning_briefing", "reminder"
    content: string; // Prompt delivered to the agent
    metadata?: Record<string, unknown>;
  };
}

export interface ActionScheduleEntry extends BaseScheduleEntry {
  mode: "action";
  action: ScheduledAction;
}

export type ScheduledAction =
  | SendMessageAction
  | HttpRequestAction;

export interface SendMessageAction {
  type: "send_message";
  channel: string;
  to?: string;
  text: string;
}

export interface HttpRequestAction {
  type: "http_request";
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeout_ms?: number;
  expect_status?: number;
}

// Command types for LLM-driven schedule management
export interface ScheduleCommand {
  action: "add" | "update" | "delete";
  entry?: Omit<ScheduleEntry, "createdAt" | "runCount" | "nextRun" | "lastRun">;
  nextRunIso?: string; // ISO 8601 datetime for one-shot entries
  id?: string; // For update/delete
  updates?: Partial<Pick<ScheduleEntry, "label" | "cron" | "activeHours" | "maxRuns">> & {
    content?: string; // For prompt mode: update event.content
  };
}

export const SCHEDULE_PREFIX = "schedule:";
