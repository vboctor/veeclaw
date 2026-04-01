import type { Env } from "./auth.ts";
import { githubJson } from "./github-fetch.ts";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  default_branch: string;
  updated_at: string;
  stargazers_count: number;
  fork: boolean;
}

interface Org {
  login: string;
  id: number;
  description: string | null;
  url: string;
}

export async function handleReposList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    org?: string;
    type?: string;
    sort?: string;
    perPage?: number;
    page?: number;
  };

  const params = new URLSearchParams();
  if (body.type) params.set("type", body.type);
  if (body.sort) params.set("sort", body.sort || "updated");
  params.set("per_page", String(body.perPage || 30));
  if (body.page) params.set("page", String(body.page));

  const path = body.org
    ? `/orgs/${encodeURIComponent(body.org)}/repos`
    : "/user/repos";

  const { data, error } = await githubJson<Repo[]>(
    env,
    `${path}?${params}`,
  );
  if (error) return error;

  const repos = data!.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    description: r.description,
    private: r.private,
    url: r.html_url,
    language: r.language,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    stars: r.stargazers_count,
    fork: r.fork,
  }));

  return Response.json({ repos });
}

export async function handleReposGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { owner: string; repo: string };

  if (!body.owner || !body.repo) {
    return Response.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }

  const { data, error } = await githubJson<Repo & {
    open_issues_count: number;
    forks_count: number;
    topics: string[];
    license: { spdx_id: string } | null;
  }>(env, `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}`);
  if (error) return error;

  return Response.json({ repo: data });
}

export async function handleReposSearch(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    query: string;
    perPage?: number;
  };

  if (!body.query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: body.query,
    per_page: String(body.perPage || 10),
  });

  const { data, error } = await githubJson<{
    total_count: number;
    items: Repo[];
  }>(env, `/search/repositories?${params}`);
  if (error) return error;

  return Response.json({
    totalCount: data!.total_count,
    repos: data!.items.map((r) => ({
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      private: r.private,
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
    })),
  });
}

export async function handleOrgsList(
  env: Env,
  _request: Request,
): Promise<Response> {
  const { data, error } = await githubJson<Org[]>(env, "/user/orgs");
  if (error) return error;

  return Response.json({
    orgs: data!.map((o) => ({
      login: o.login,
      id: o.id,
      description: o.description,
    })),
  });
}
