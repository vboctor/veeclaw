import type { Env } from "./auth.ts";
import { resolveInstance } from "./auth.ts";
import { mantishubJson } from "./mantishub-fetch.ts";

export async function handleProjectFilters(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
  };

  if (!body.projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<{ filters: unknown[] }>(
    config,
    `/projects/${body.projectId}/filters`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleProjectChangelog(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
  };

  if (!body.projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<unknown>(
    config,
    `/projects/${body.projectId}/pages/changelog`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleProjectRoadmap(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
  };

  if (!body.projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<unknown>(
    config,
    `/projects/${body.projectId}/pages/roadmap`,
  );
  if (error) return error;

  return Response.json(data);
}
