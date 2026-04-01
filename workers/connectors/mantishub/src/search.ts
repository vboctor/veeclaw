import type { Env } from "./auth.ts";
import { resolveInstance } from "./auth.ts";
import { mantishubJson } from "./mantishub-fetch.ts";

export async function handleSearch(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    query: string;
    types?: string[];
    project?: { id?: number; name?: string };
    limit?: number;
  };

  if (!body.query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {
    text: body.query,
  };
  if (body.types) apiBody.types = body.types;
  if (body.project) apiBody.project = body.project;
  if (body.limit) apiBody.limit = body.limit;

  const { data, error } = await mantishubJson<unknown>(config, "/search", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json(data);
}

export async function handleDiscover(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
  };

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<unknown>(config, "/discover");
  if (error) return error;

  return Response.json(data);
}
