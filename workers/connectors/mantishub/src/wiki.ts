import type { Env } from "./auth.ts";
import { resolveInstance } from "./auth.ts";
import { mantishubJson } from "./mantishub-fetch.ts";

export async function handleWikiList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
    query?: string;
    limit?: number;
  };

  if (!body.projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const params = new URLSearchParams();
  if (body.query) params.set("text", body.query);
  if (body.limit) params.set("limit", String(body.limit));

  const queryStr = params.toString();
  const path = `/projects/${body.projectId}/pages/pages/browse${queryStr ? `?${queryStr}` : ""}`;

  const { data, error } = await mantishubJson<unknown>(config, path);
  if (error) return error;

  return Response.json(data);
}

export async function handleWikiGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
    pageName: string;
  };

  if (!body.projectId || !body.pageName) {
    return Response.json(
      { error: "projectId and pageName are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<unknown>(
    config,
    `/projects/${body.projectId}/pages/name/${encodeURIComponent(body.pageName)}`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleWikiUpdate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    projectId: number;
    pageName: string;
    content: string;
  };

  if (!body.projectId || !body.pageName || !body.content) {
    return Response.json(
      { error: "projectId, pageName, and content are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  // Get the page update form to retrieve the current revision info
  const { data: formData, error: formError } = await mantishubJson<{
    page?: { id: number; revision_id: number };
  }>(
    config,
    `/projects/${body.projectId}/pages/update/${encodeURIComponent(body.pageName)}`,
  );
  if (formError) return formError;

  // Submit the update
  const apiBody: Record<string, unknown> = {
    content: body.content,
  };

  const { data, error } = await mantishubJson<unknown>(
    config,
    `/projects/${body.projectId}/pages/name/${encodeURIComponent(body.pageName)}`,
    {
      method: "PATCH",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json(data);
}
