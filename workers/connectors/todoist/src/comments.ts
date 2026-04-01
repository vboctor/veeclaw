import type { Env } from "./auth.ts";
import { todoistJson } from "./todoist-fetch.ts";

export async function handleCommentsList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    taskId?: string;
    projectId?: string;
  };

  const params = new URLSearchParams();
  if (body.taskId) params.set("task_id", body.taskId);
  if (body.projectId) params.set("project_id", body.projectId);

  const queryStr = params.toString();
  const { data, error } = await todoistJson<unknown[]>(
    env,
    `/comments${queryStr ? `?${queryStr}` : ""}`,
  );
  if (error) return error;

  return Response.json({ comments: data });
}

export async function handleCommentsCreate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    content: string;
    taskId?: string;
    projectId?: string;
  };

  if (!body.content) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }
  if (!body.taskId && !body.projectId) {
    return Response.json(
      { error: "taskId or projectId is required" },
      { status: 400 },
    );
  }

  const apiBody: Record<string, unknown> = { content: body.content };
  if (body.taskId) apiBody.task_id = body.taskId;
  if (body.projectId) apiBody.project_id = body.projectId;

  const { data, error } = await todoistJson<unknown>(env, "/comments", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json({ comment: data });
}
