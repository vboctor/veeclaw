import type { Tool } from "@veeclaw/shared";
import {
  listSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  buildScheduleEntry,
} from "../schedule/store.ts";
import {
  cronLocalToUtc,
  cronUtcToLocal,
  cronToLocalDescription,
  isoLocalToUtc,
} from "../schedule/timezone.ts";

export const SCHEDULE_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "schedule_list",
      description: "List all active scheduled tasks and reminders",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description:
              "User's IANA timezone (e.g., 'America/Los_Angeles'). Times in the response will be shown in this timezone.",
          },
        },
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
          timezone: {
            type: "string",
            description: "User's IANA timezone for displaying times",
          },
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
        "Create a new scheduled task or reminder. Provide cron and times in the USER'S LOCAL TIMEZONE — the system converts to UTC automatically.",
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
              "5-field cron expression IN THE USER'S LOCAL TIMEZONE (e.g., '0 9 * * 1-5' for weekdays at 9am local). The system converts to UTC. Required for recurring schedules.",
          },
          nextRunIso: {
            type: "string",
            description:
              "ISO 8601 datetime IN THE USER'S LOCAL TIMEZONE (e.g., '2026-03-28T16:00:00'). The system converts to UTC. Required for one-shot type.",
          },
          timezone: {
            type: "string",
            description:
              "REQUIRED. User's IANA timezone (e.g., 'America/Los_Angeles'). Used to convert cron/nextRunIso to UTC.",
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
        required: ["id", "mode", "type", "label", "timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_update",
      description:
        "Update an existing scheduled task. Provide cron in the USER'S LOCAL TIMEZONE — the system converts to UTC automatically.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Schedule entry ID to update" },
          label: { type: "string", description: "New label" },
          cron: {
            type: "string",
            description:
              "New cron expression IN THE USER'S LOCAL TIMEZONE. The system converts to UTC.",
          },
          content: { type: "string", description: "New prompt/message content" },
          maxRuns: { type: "number", description: "New max runs limit" },
          timezone: {
            type: "string",
            description:
              "User's IANA timezone (e.g., 'America/Los_Angeles'). Required when updating cron.",
          },
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
    schedule_list: async (argsJson: string) => {
      const args = argsJson ? JSON.parse(argsJson) as { timezone?: string } : {};
      const entries = await listSchedules(kv);
      if (entries.length === 0) return "No schedules configured.";
      return JSON.stringify(
        entries.map((e) => {
          const base: Record<string, unknown> = {
            id: e.id,
            label: e.label,
            mode: e.mode,
            type: e.type,
            runCount: e.runCount,
            maxRuns: e.maxRuns,
            successCount: e.successCount,
            failureCount: e.failureCount,
            lastRun: e.lastRun,
            lastRunStatus: e.lastRunStatus,
          };

          if (e.type === "recurring" && e.cron) {
            base.cronUtc = e.cron;
            if (args.timezone) {
              base.cronLocal = cronUtcToLocal(e.cron, args.timezone);
              base.scheduleDescription = cronToLocalDescription(e.cron, args.timezone);
            }
          }

          return base;
        }),
        null,
        2
      );
    },

    schedule_get: async (argsJson: string) => {
      const { id, timezone } = JSON.parse(argsJson) as { id: string; timezone?: string };
      const entry = await getSchedule(kv, id);
      if (!entry) return JSON.stringify({ error: `Schedule '${id}' not found` });

      const result = { ...entry } as Record<string, unknown>;
      if (entry.type === "recurring" && entry.cron && timezone) {
        result.cronLocal = cronUtcToLocal(entry.cron, timezone);
        result.scheduleDescription = cronToLocalDescription(entry.cron, timezone);
      }

      return JSON.stringify(result, null, 2);
    },

    schedule_create: async (argsJson: string) => {
      const args = JSON.parse(argsJson) as {
        id: string;
        mode: string;
        type: string;
        cron?: string;
        nextRunIso?: string;
        timezone: string;
        label: string;
        content?: string;
        maxRuns?: number;
        actionType?: string;
        channel?: string;
      };

      // Convert cron from local timezone to UTC
      const utcCron = args.cron && args.timezone
        ? cronLocalToUtc(args.cron, args.timezone)
        : args.cron;

      // Convert nextRunIso from local timezone to UTC
      const utcNextRun = args.nextRunIso && args.timezone
        ? isoLocalToUtc(args.nextRunIso, args.timezone)
        : args.nextRunIso;

      let entryData: Record<string, unknown>;

      if (args.mode === "prompt") {
        entryData = {
          id: args.id,
          mode: "prompt",
          type: args.type,
          cron: utcCron,
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
          cron: utcCron,
          label: args.label,
          maxRuns: args.maxRuns,
          action: {
            type: args.actionType ?? "send_message",
            channel: args.channel ?? "telegram",
            text: args.content ?? args.label,
          },
        };
      }

      const entry = buildScheduleEntry(entryData, utcNextRun);
      await addSchedule(kv, entry);
      return JSON.stringify({ ok: true, id: entry.id, label: entry.label });
    },

    schedule_update: async (argsJson: string) => {
      const { id, timezone, ...updates } = JSON.parse(argsJson) as {
        id: string;
        timezone?: string;
        label?: string;
        cron?: string;
        content?: string;
        maxRuns?: number;
      };

      // Convert cron from local timezone to UTC
      if (updates.cron && timezone) {
        updates.cron = cronLocalToUtc(updates.cron, timezone);
      }

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
