import type { Env } from "./auth.ts";
import { todoistJson } from "./todoist-fetch.ts";

export async function handleProjectsList(
  env: Env,
  _request: Request,
): Promise<Response> {
  const { data, error } = await todoistJson<unknown[]>(env, "/projects");
  if (error) return error;

  return Response.json({ projects: data });
}

export async function handleProjectsGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { projectId: string };

  if (!body.projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const { data, error } = await todoistJson<unknown>(
    env,
    `/projects/${body.projectId}`,
  );
  if (error) return error;

  return Response.json({ project: data });
}
