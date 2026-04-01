import type { Env } from "./auth.ts";
import { todoistJson, todoistFetch } from "./todoist-fetch.ts";

export async function handleTasksList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    projectId?: string;
    sectionId?: string;
    label?: string;
    filter?: string;
  };

  const params = new URLSearchParams();
  if (body.projectId) params.set("project_id", body.projectId);
  if (body.sectionId) params.set("section_id", body.sectionId);
  if (body.label) params.set("label", body.label);
  if (body.filter) params.set("filter", body.filter);

  const queryStr = params.toString();
  const { data, error } = await todoistJson<unknown[]>(
    env,
    `/tasks${queryStr ? `?${queryStr}` : ""}`,
  );
  if (error) return error;

  return Response.json({ tasks: data });
}

export async function handleTasksGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { taskId: string };

  if (!body.taskId) {
    return Response.json({ error: "taskId is required" }, { status: 400 });
  }

  const { data, error } = await todoistJson<unknown>(
    env,
    `/tasks/${body.taskId}`,
  );
  if (error) return error;

  return Response.json({ task: data });
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
  if (body.priority) apiBody.priority = body.priority;
  if (body.dueString) apiBody.due_string = body.dueString;
  if (body.dueDate) apiBody.due_date = body.dueDate;
  if (body.dueDatetime) apiBody.due_datetime = body.dueDatetime;
  if (body.dueLang) apiBody.due_lang = body.dueLang;
  if (body.assigneeId) apiBody.assignee_id = body.assigneeId;
  if (body.duration) apiBody.duration = body.duration;
  if (body.durationUnit) apiBody.duration_unit = body.durationUnit;

  const { data, error } = await todoistJson<unknown>(env, "/tasks", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json({ task: data });
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
  if (body.priority) apiBody.priority = body.priority;
  if (body.dueString) apiBody.due_string = body.dueString;
  if (body.dueDate) apiBody.due_date = body.dueDate;
  if (body.dueDatetime) apiBody.due_datetime = body.dueDatetime;
  if (body.assigneeId !== undefined) apiBody.assignee_id = body.assigneeId;

  const { data, error } = await todoistJson<unknown>(
    env,
    `/tasks/${body.taskId}`,
    {
      method: "POST",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json({ task: data });
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
