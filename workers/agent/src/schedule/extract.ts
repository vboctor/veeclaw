import type { ScheduleCommand } from "@scaf/shared";
import {
  addSchedule,
  updateSchedule,
  deleteSchedule,
  buildScheduleEntry,
} from "./store.ts";

const COMMAND_REGEX =
  /<schedule_command>([\s\S]*?)<\/schedule_command>/g;

export interface ExtractionResult {
  cleanContent: string;
  commands: ScheduleCommand[];
}

/**
 * Parse schedule commands from the LLM response.
 * Commands are embedded as <schedule_command>JSON</schedule_command> blocks.
 * Returns the cleaned content (commands stripped) and parsed commands.
 */
export function extractScheduleCommands(content: string): ExtractionResult {
  const commands: ScheduleCommand[] = [];

  const cleanContent = content.replace(COMMAND_REGEX, (_match, json: string) => {
    try {
      const cmd = JSON.parse(json.trim()) as ScheduleCommand;
      commands.push(cmd);
    } catch {
      // Malformed command — skip
    }
    return "";
  }).trim();

  return { cleanContent, commands };
}

/**
 * Process extracted schedule commands directly against KV.
 * Returns a summary of what was done for logging.
 */
export async function processScheduleCommands(
  kv: KVNamespace,
  commands: ScheduleCommand[]
): Promise<string[]> {
  const results: string[] = [];

  for (const cmd of commands) {
    try {
      switch (cmd.action) {
        case "add": {
          if (!cmd.entry) break;
          const entry = buildScheduleEntry(
            cmd.entry as unknown as Record<string, unknown>,
            cmd.nextRunIso
          );
          await addSchedule(kv, entry);
          results.push(`Added schedule: ${entry.label} (${entry.id})`);
          break;
        }

        case "update": {
          if (!cmd.id || !cmd.updates) break;
          const updated = await updateSchedule(kv, cmd.id, cmd.updates);
          if (updated) {
            results.push(`Updated schedule: ${updated.label} (${cmd.id})`);
          } else {
            results.push(`Schedule not found: ${cmd.id}`);
          }
          break;
        }

        case "delete": {
          if (!cmd.id) break;
          const deleted = await deleteSchedule(kv, cmd.id);
          results.push(
            deleted
              ? `Deleted schedule: ${cmd.id}`
              : `Schedule not found: ${cmd.id}`
          );
          break;
        }
      }
    } catch (err) {
      results.push(`Error processing command: ${err}`);
    }
  }

  return results;
}
