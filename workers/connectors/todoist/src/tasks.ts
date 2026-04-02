import type { Env } from "./auth.ts";
import { syncRead, syncWrite } from "./todoist-fetch.ts";

/**
 * Convert user-facing priority (1=urgent, 2=high, 3=medium, 4=normal)
 * to Todoist API priority (1=normal, 4=urgent).
 */
function toApiPriority(userPriority: number): number {
  return 5 - userPriority;
}

function toUserPriority(apiPriority: number): number {
  return 5 - apiPriority;
}

function uuid(): string {
  return crypto.randomUUID();
}

interface SyncTask {
  id: string;
  content: string;
  description: string;
  project_id: string;
  section_id: string | null;
  parent_id: string | null;
  labels: string[];
  priority: number;
  due: { date: string; datetime?: string; is_recurring: boolean } | null;
  deadline: { date: string; datetime?: string } | null;
  checked: boolean;
  added_at: string;
  updated_at: string;
}

function slimTask(t: SyncTask) {
  return {
    id: t.id,
    content: t.content,
    description: t.description || undefined,
    projectId: t.project_id,
    parentId: t.parent_id || undefined,
    labels: t.labels?.length > 0 ? t.labels : undefined,
    priority: toUserPriority(t.priority),
    due: t.due || undefined,
    deadline: t.deadline || undefined,
    checked: t.checked,
  };
}

async function fetchAllItems(env: Env): Promise<{ items?: SyncTask[]; error?: Response }> {
  const { data, error } = await syncRead(env, ["items"]);
  if (error) return { error };
  const items = (data!.items as SyncTask[]) || [];
  // Filter out deleted/completed items
  return { items: items.filter((t) => !t.checked) };
}

export async function handleTasksList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    projectId?: string;
    sectionId?: string;
    label?: string;
    search?: string | string[];
    limit?: number;
  };

  const { items, error } = await fetchAllItems(env);
  if (error) return error;

  let result = items!;

  if (body.projectId) {
    result = result.filter((t) => t.project_id === body.projectId);
  }
  if (body.sectionId) {
    result = result.filter((t) => t.section_id === body.sectionId);
  }
  if (body.label) {
    result = result.filter((t) => t.labels?.includes(body.label!));
  }

  // Client-side text search — supports single string or array of phrases (OR match)
  if (body.search) {
    const phrases = Array.isArray(body.search) ? body.search : [body.search];
    const queries = phrases.map((q) => q.toLowerCase());
    result = result.filter((t) => {
      const content = t.content.toLowerCase();
      const desc = t.description?.toLowerCase() ?? "";
      return queries.some((q) => content.includes(q) || desc.includes(q));
    });
  }

  // Sort by most recently added first
  result.sort(
    (a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime(),
  );

  if (body.limit && body.limit > 0) {
    result = result.slice(0, body.limit);
  }

  return Response.json({ tasks: result.map(slimTask) });
}

export async function handleTasksGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };
  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const { items, error } = await fetchAllItems(env);
  if (error) return error;

  const task = items!.find((t) => t.id === body.taskId);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task: slimTask(task) });
}

/**
 * Extract time from a dueString like "today at 6pm" or "April 5 at 10:30am".
 * Returns { dateOnly, reminderTime } where dateOnly has the time stripped
 * and reminderTime is a normalized time string (e.g., "18:00").
 * If no time is found, reminderTime is null.
 */
function splitDateAndTime(dueString: string): {
  dateOnly: string;
  reminderTime: string | null;
} {
  // Match patterns like "at 6pm", "at 10:30am", "at 18:00"
  const timePattern = /\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
  const match = dueString.match(timePattern);

  if (!match) {
    return { dateOnly: dueString, reminderTime: null };
  }

  const dateOnly = dueString.replace(timePattern, "").trim();
  const timeStr = match[1].trim().toLowerCase();

  // Parse the time
  let hours: number;
  let minutes = 0;

  const colonMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  const simpleMatch = timeStr.match(/^(\d{1,2})\s*(am|pm)$/);

  if (colonMatch) {
    hours = parseInt(colonMatch[1]);
    minutes = parseInt(colonMatch[2]);
    const ampm = colonMatch[3];
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else if (simpleMatch) {
    hours = parseInt(simpleMatch[1]);
    const ampm = simpleMatch[2];
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  } else {
    return { dateOnly: dueString, reminderTime: null };
  }

  const reminderTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  return { dateOnly, reminderTime };
}

/**
 * Resolve a relative date string like "today", "tomorrow" to a YYYY-MM-DD date.
 */
function resolveDate(dateStr: string, timezone?: string): string {
  const lower = dateStr.toLowerCase().trim();

  // Get "now" in the user's timezone
  const nowLocal = timezone
    ? new Date(new Date().toLocaleString("en-US", { timeZone: timezone }))
    : new Date();

  function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  if (lower === "today" || lower === "tonight" || lower === "this evening") {
    return formatDate(nowLocal);
  }
  if (lower === "tomorrow") {
    nowLocal.setDate(nowLocal.getDate() + 1);
    return formatDate(nowLocal);
  }

  // Handle day names (e.g., "friday", "next monday")
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const cleanLower = lower.replace(/^next\s+/, "");
  const dayIndex = dayNames.indexOf(cleanLower);
  if (dayIndex !== -1) {
    const currentDay = nowLocal.getDay();
    let daysAhead = dayIndex - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    nowLocal.setDate(nowLocal.getDate() + daysAhead);
    return formatDate(nowLocal);
  }

  // Try to parse as a date
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return formatDate(parsed);
  }

  // Fallback to today in user's timezone
  return formatDate(nowLocal);
}

export async function handleTasksCreate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    content: string;
    description?: string;
    projectId?: string;
    sectionId?: string;
    parentId?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
    dueDate?: string;
    dueDatetime?: string;
    dueLang?: string;
    reminderTime?: string;
    timezone?: string;
  };

  if (!body.content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  // If dueString contains a time (e.g., "today at 6pm"), split it:
  // - due date gets the date only
  // - a reminder is automatically created with the time
  let dueString = body.dueString;
  let autoReminderTime: string | null = body.reminderTime || null;

  if (dueString) {
    const { dateOnly, reminderTime } = splitDateAndTime(dueString);
    if (reminderTime) {
      dueString = dateOnly;
      autoReminderTime = autoReminderTime || reminderTime;
    }
  }

  const args: Record<string, unknown> = { content: body.content };
  if (body.description) args.description = body.description;
  if (body.projectId) args.project_id = body.projectId;
  if (body.sectionId) args.section_id = body.sectionId;
  if (body.parentId) args.parent_id = body.parentId;
  if (body.labels) args.labels = body.labels;
  if (body.priority) args.priority = toApiPriority(body.priority);
  // Sync API uses due.date, not due_string. Resolve relative dates to YYYY-MM-DD.
  if (dueString) {
    args.due = { date: resolveDate(dueString, body.timezone), timezone: body.timezone };
  }
  if (body.dueDate) args.due = { date: body.dueDate, timezone: body.timezone };

  const taskTempId = uuid();
  const commands: Array<{ type: string; uuid: string; temp_id?: string; args: Record<string, unknown> }> = [
    { type: "item_add", uuid: uuid(), temp_id: taskTempId, args },
  ];

  // Auto-create reminder if a time was specified
  if (autoReminderTime) {
    const dateStr = body.dueDate || (dueString ? resolveDate(dueString, body.timezone) : resolveDate("today", body.timezone));
    commands.push({
      type: "reminder_add",
      uuid: uuid(),
      temp_id: uuid(),
      args: {
        item_id: taskTempId,
        type: "absolute",
        due: { date: `${dateStr}T${autoReminderTime}:00`, timezone: body.timezone },
      },
    });
  }

  const { data, error } = await syncWrite(env, commands);
  if (error) return error;

  const realId = data!.temp_id_mapping[taskTempId] || taskTempId;
  return Response.json({
    task: {
      id: realId,
      content: body.content,
      dueDate: dueString || body.dueDate,
      reminder: autoReminderTime || undefined,
      ok: true,
    },
  });
}

export async function handleTasksUpdate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    taskId: string;
    content?: string;
    description?: string;
    labels?: string[];
    priority?: number;
    dueString?: string;
    dueDate?: string;
    dueDatetime?: string;
  };

  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const args: Record<string, unknown> = { id: body.taskId };
  if (body.content) args.content = body.content;
  if (body.description !== undefined) args.description = body.description;
  if (body.labels) args.labels = body.labels;
  if (body.priority) args.priority = toApiPriority(body.priority);
  if (body.dueString) args.due = { date: resolveDate(body.dueString) };
  if (body.dueDate) args.due = { date: body.dueDate };

  const { error } = await syncWrite(env, [
    { type: "item_update", uuid: uuid(), args },
  ]);
  if (error) return error;

  return Response.json({ ok: true, taskId: body.taskId });
}

export async function handleTasksSubtasks(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };
  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const { items, error } = await fetchAllItems(env);
  if (error) return error;

  const subtasks = items!.filter((t) => t.parent_id === body.taskId);
  return Response.json({ tasks: subtasks.map(slimTask) });
}

export async function handleTasksComplete(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };
  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const { error } = await syncWrite(env, [
    { type: "item_complete", uuid: uuid(), args: { id: body.taskId } },
  ]);
  if (error) return error;

  return Response.json({ ok: true });
}

export async function handleTasksReopen(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };
  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const { error } = await syncWrite(env, [
    { type: "item_uncomplete", uuid: uuid(), args: { id: body.taskId } },
  ]);
  if (error) return error;

  return Response.json({ ok: true });
}

export async function handleTasksReminder(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    taskId: string;
    type: "absolute" | "relative";
    dueString?: string;
    minuteOffset?: number;
  };

  if (!body.taskId || !body.type) {
    return Response.json(
      { error: "taskId and type are required" },
      { status: 400 },
    );
  }

  const args: Record<string, unknown> = {
    item_id: body.taskId,
    type: body.type,
  };

  if (body.type === "absolute" && body.dueString) {
    args.due = { date: body.dueString };
  } else if (body.type === "relative" && body.minuteOffset !== undefined) {
    args.minute_offset = body.minuteOffset;
  }

  const { error } = await syncWrite(env, [
    { type: "reminder_add", uuid: uuid(), temp_id: uuid(), args },
  ]);
  if (error) return error;

  return Response.json({ ok: true });
}
