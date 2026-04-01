import type { Env } from "./auth.ts";
import { todoistJson, todoistFetch } from "./todoist-fetch.ts";

/**
 * Convert user-facing priority (1=urgent, 2=high, 3=medium, 4=normal)
 * to Todoist API priority (1=normal, 4=urgent).
 * Todoist API is inverted from what users expect.
 */
function toApiPriority(userPriority: number): number {
  return 5 - userPriority;
}

/**
 * Convert Todoist API priority back to user-facing priority.
 */
function toUserPriority(apiPriority: number): number {
  return 5 - apiPriority;
}

interface TodoistTask {
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
  note_count: number;
  added_at: string;
  child_order: number;
}

/** Slim down task object to reduce token usage */
function slimTask(t: TodoistTask) {
  return {
    id: t.id,
    content: t.content,
    description: t.description || undefined,
    projectId: t.project_id,
    parentId: t.parent_id || undefined,
    labels: t.labels?.length > 0 ? t.labels : undefined,
    priority: toUserPriority(t.priority),
    due: t.due ? { date: t.due.date, datetime: t.due.datetime, recurring: t.due.is_recurring } : undefined,
    deadline: t.deadline || undefined,
    comments: t.note_count || undefined,
  };
}

/** Extract tasks array from Todoist API response (v1 wraps in { results: [...] }) */
function extractTasks(data: unknown): TodoistTask[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "results" in data) {
    return (data as { results: TodoistTask[] }).results;
  }
  return [];
}

export async function handleTasksList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    projectId?: string;
    sectionId?: string;
    label?: string;
    filter?: string;
    search?: string | string[];
    limit?: number;
  };

  const params = new URLSearchParams();
  if (body.projectId) params.set("project_id", body.projectId);
  if (body.sectionId) params.set("section_id", body.sectionId);
  if (body.label) params.set("label", body.label);
  // Note: Todoist v1 API 'filter' param doesn't work for text search.
  // We do client-side filtering with the 'search' param instead.

  // Paginate through all results
  const allTasks: TodoistTask[] = [];
  let cursor: string | null = null;

  do {
    const pageParams = new URLSearchParams(params);
    if (cursor) pageParams.set("cursor", cursor);

    const queryStr = pageParams.toString();
    const { data, error } = await todoistJson<{
      results?: TodoistTask[];
      next_cursor?: string;
    }>(env, `/tasks${queryStr ? `?${queryStr}` : ""}`);
    if (error) return error;

    const tasks = extractTasks(data);
    allTasks.push(...tasks);
    cursor = (data as { next_cursor?: string })?.next_cursor ?? null;
  } while (cursor);

  let result = allTasks;

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

  // Sort by added_at descending (most recent first)
  result.sort(
    (a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime(),
  );

  // Apply limit
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

  const { data, error } = await todoistJson<TodoistTask>(
    env,
    `/tasks/${body.taskId}`,
  );
  if (error) return error;

  return Response.json({ task: slimTask(data!) });
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
    assigneeId?: string;
    duration?: number;
    durationUnit?: string;
  };

  if (!body.content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const apiBody: Record<string, unknown> = { content: body.content };
  if (body.description) apiBody.description = body.description;
  if (body.projectId) apiBody.project_id = body.projectId;
  if (body.sectionId) apiBody.section_id = body.sectionId;
  if (body.parentId) apiBody.parent_id = body.parentId;
  if (body.labels) apiBody.labels = body.labels;
  if (body.priority) apiBody.priority = toApiPriority(body.priority);
  if (body.dueString) apiBody.due_string = body.dueString;
  if (body.dueDate) apiBody.due_date = body.dueDate;
  if (body.dueDatetime) apiBody.due_datetime = body.dueDatetime;
  if (body.dueLang) apiBody.due_lang = body.dueLang;
  if (body.assigneeId) apiBody.assignee_id = body.assigneeId;
  if (body.duration) apiBody.duration = body.duration;
  if (body.durationUnit) apiBody.duration_unit = body.durationUnit;

  const { data, error } = await todoistJson<TodoistTask>(env, "/tasks", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json({ task: slimTask(data!) });
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
    assigneeId?: string;
  };

  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const apiBody: Record<string, unknown> = {};
  if (body.content) apiBody.content = body.content;
  if (body.description !== undefined) apiBody.description = body.description;
  if (body.labels) apiBody.labels = body.labels;
  if (body.priority) apiBody.priority = toApiPriority(body.priority);
  if (body.dueString) apiBody.due_string = body.dueString;
  if (body.dueDate) apiBody.due_date = body.dueDate;
  if (body.dueDatetime) apiBody.due_datetime = body.dueDatetime;
  if (body.assigneeId !== undefined) apiBody.assignee_id = body.assigneeId;

  const { data, error } = await todoistJson<TodoistTask>(
    env,
    `/tasks/${body.taskId}`,
    {
      method: "POST",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json({ task: slimTask(data!) });
}

export async function handleTasksSubtasks(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };

  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  // Paginate through all tasks and filter by parent_id
  const allTasks: TodoistTask[] = [];
  let cursor: string | null = null;

  do {
    const url: string = cursor ? `/tasks?cursor=${encodeURIComponent(cursor)}` : "/tasks";
    const { data, error } = await todoistJson<{
      results?: TodoistTask[];
      next_cursor?: string;
    }>(env, url);
    if (error) return error;

    allTasks.push(...extractTasks(data));
    cursor = (data as { next_cursor?: string })?.next_cursor ?? null;
  } while (cursor);

  const subtasks = allTasks.filter((t) => t.parent_id === body.taskId);
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

  const res = await todoistFetch(env, `/tasks/${body.taskId}/close`, {
    method: "POST",
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text, status: res.status }, { status: res.status });
  }

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

  const res = await todoistFetch(env, `/tasks/${body.taskId}/reopen`, {
    method: "POST",
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text, status: res.status }, { status: res.status });
  }

  return Response.json({ ok: true });
}
