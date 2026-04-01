import type { Tool } from "@veeclaw/shared";
import {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  buildScheduleEntry,
} from "../schedule/store.ts";

export const SCHEDULE_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "schedule_list",
      description: "List all active scheduled tasks and reminders",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_get",
      description: "Get details of a specific scheduled task by ID",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Schedule entry ID" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_create",
      description:
        "Create a new scheduled task or reminder. Use mode 'prompt' for tasks that need LLM reasoning, 'action' for fixed messages.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              "Short kebab-case slug (e.g., 'daily-standup', 'water-reminder')",
          },
          mode: {
            type: "string",
            enum: ["prompt", "action"],
            description:
              "'prompt' for LLM-driven tasks, 'action' for fixed messages/HTTP calls",
          },
          type: {
            type: "string",
            enum: ["recurring", "one-shot"],
            description: "'recurring' for repeated schedules, 'one-shot' for reminders",
          },
          cron: {
            type: "string",
            description:
              "5-field cron expression (e.g., '0 9 * * 1-5' for weekdays at 9am). Required for recurring schedules.",
          },
          nextRunIso: {
            type: "string",
            description:
              "ISO 8601 datetime for one-shot reminders (e.g., '2026-03-28T16:00:00'). Required for one-shot type.",
          },
          label: {
            type: "string",
            description: "Human-readable description of the schedule",
          },
          content: {
            type: "string",
            description:
              "For prompt mode: the instruction to execute. For action mode with send_message: the message text.",
          },
          maxRuns: {
            type: "number",
            description:
              "Maximum number of times a recurring schedule fires. Omit for unlimited.",
          },
          actionType: {
            type: "string",
            enum: ["send_message", "http_request"],
            description: "For action mode: type of action to perform",
          },
          channel: {
            type: "string",
            description: "For send_message action: channel to send to (e.g., 'telegram')",
          },
        },
        required: ["id", "mode", "type", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_update",
      description: "Update an existing scheduled task",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Schedule entry ID to update" },
          label: { type: "string", description: "New label" },
          cron: { type: "string", description: "New cron expression" },
          content: { type: "string", description: "New prompt/message content" },
          maxRuns: { type: "number", description: "New max runs limit" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_delete",
      description: "Delete a scheduled task",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Schedule entry ID to delete" },
        },
        required: ["id"],
      },
    },
  },
];

/**
 * Build internal tool handlers for schedule operations.
 * Returns a map of tool name -> handler function.
 */
export function buildScheduleToolHandlers(
  kv: KVNamespace
): Record<string, (args: string) => Promise<string>> {
  return {
    schedule_list: async () => {
      const entries = await listSchedules(kv);
      if (entries.length === 0) return "No schedules configured.";
      return JSON.stringify(
        entries.map((e) => ({
          id: e.id,
          label: e.label,
          mode: e.mode,
          type: e.type,
          cron: e.type === "recurring" ? e.cron : undefined,
          runCount: e.runCount,
          maxRuns: e.maxRuns,
          successCount: e.successCount,
          failureCount: e.failureCount,
          lastRun: e.lastRun,
          lastRunStatus: e.lastRunStatus,
        })),
        null,
        2
      );
    },

    schedule_get: async (argsJson: string) => {
      const { id } = JSON.parse(argsJson) as { id: string };
      const entry = await getSchedule(kv, id);
      if (!entry) return JSON.stringify({ error: `Schedule '${id}' not found` });
      return JSON.stringify(entry, null, 2);
    },

    schedule_create: async (argsJson: string) => {
      const args = JSON.parse(argsJson) as {
        id: string;
        mode: string;
        type: string;
        cron?: string;
        nextRunIso?: string;
        label: string;
        content?: string;
        maxRuns?: number;
        actionType?: string;
        channel?: string;
      };

      let entryData: Record<string, unknown>;

      if (args.mode === "prompt") {
        entryData = {
          id: args.id,
          mode: "prompt",
          type: args.type,
          cron: args.cron,
          label: args.label,
          maxRuns: args.maxRuns,
          event: {
            type: "reminder",
            content: args.content ?? args.label,
          },
        };
      } else {
        entryData = {
          id: args.id,
          mode: "action",
          type: args.type,
          cron: args.cron,
          label: args.label,
          maxRuns: args.maxRuns,
          action: {
            type: args.actionType ?? "send_message",
            channel: args.channel ?? "telegram",
            text: args.content ?? args.label,
          },
        };
      }

      const entry = buildScheduleEntry(entryData, args.nextRunIso);
      await addSchedule(kv, entry);
      return JSON.stringify({ ok: true, id: entry.id, label: entry.label });
    },

    schedule_update: async (argsJson: string) => {
      const { id, ...updates } = JSON.parse(argsJson) as {
        id: string;
        label?: string;
        cron?: string;
        content?: string;
        maxRuns?: number;
      };
      const updated = await updateSchedule(kv, id, updates);
      if (!updated)
        return JSON.stringify({ error: `Schedule '${id}' not found` });
      return JSON.stringify({ ok: true, id: updated.id, label: updated.label });
    },

    schedule_delete: async (argsJson: string) => {
      const { id } = JSON.parse(argsJson) as { id: string };
      const deleted = await deleteSchedule(kv, id);
      if (!deleted)
        return JSON.stringify({ error: `Schedule '${id}' not found` });
      return JSON.stringify({ ok: true, id });
    },
  };
}
