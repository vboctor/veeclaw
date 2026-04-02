import type { Env } from "./auth.ts";
import { syncRead } from "./todoist-fetch.ts";

interface SyncProject {
  id: string;
  name: string;
  color: string;
  is_favorite: boolean;
  parent_id: string | null;
  is_deleted: boolean;
  is_archived: boolean;
  order: number;
  inbox_project: boolean;
}

function slimProject(p: SyncProject) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    favorite: p.is_favorite || undefined,
    parentId: p.parent_id || undefined,
    inbox: p.inbox_project || undefined,
  };
}

export async function handleProjectsList(
  env: Env,
  _request: Request,
): Promise<Response> {
  const { data, error } = await syncRead(env, ["projects"]);
  if (error) return error;

  const projects = ((data!.projects as SyncProject[]) || [])
    .filter((p) => !p.is_deleted && !p.is_archived);

  return Response.json({ projects: projects.map(slimProject) });
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

  const { data, error } = await syncRead(env, ["projects"]);
  if (error) return error;

  const projects = (data!.projects as SyncProject[]) || [];
  const project = projects.find((p) => p.id === body.projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json({ project: slimProject(project) });
}
