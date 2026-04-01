import type { Env } from "./auth.ts";
import { githubJson } from "./github-fetch.ts";

interface Issue {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  comments: number;
  pull_request?: unknown;
}

export async function handleIssuesList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    state?: string;
    labels?: string;
    assignee?: string;
    sort?: string;
    perPage?: number;
    page?: number;
  };

  if (!body.owner || !body.repo) {
    return Response.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    state: body.state || "open",
    per_page: String(body.perPage || 30),
  });
  if (body.labels) params.set("labels", body.labels);
  if (body.assignee) params.set("assignee", body.assignee);
  if (body.sort) params.set("sort", body.sort);
  if (body.page) params.set("page", String(body.page));

  const { data, error } = await githubJson<Issue[]>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues?${params}`,
  );
  if (error) return error;

  // Filter out pull requests (GitHub issues endpoint includes PRs)
  const issues = data!.filter((i) => !i.pull_request);

  return Response.json({
    issues: issues.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      url: i.html_url,
      author: i.user.login,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      labels: i.labels.map((l) => l.name),
      assignees: i.assignees.map((a) => a.login),
      commentCount: i.comments,
    })),
  });
}

export async function handleIssuesGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    issueNumber: number;
  };

  if (!body.owner || !body.repo || !body.issueNumber) {
    return Response.json(
      { error: "owner, repo, and issueNumber are required" },
      { status: 400 },
    );
  }

  const { data, error } = await githubJson<Issue>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues/${body.issueNumber}`,
  );
  if (error) return error;

  return Response.json({ issue: data });
}

export async function handleIssuesSearch(
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
    items: Issue[];
  }>(env, `/search/issues?${params}`);
  if (error) return error;

  return Response.json({
    totalCount: data!.total_count,
    issues: data!.items.map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      url: i.html_url,
      author: i.user.login,
      createdAt: i.created_at,
      labels: i.labels.map((l) => l.name),
    })),
  });
}

export async function handleIssuesCreate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
  };

  if (!body.owner || !body.repo || !body.title) {
    return Response.json(
      { error: "owner, repo, and title are required" },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = { title: body.title };
  if (body.body) payload.body = body.body;
  if (body.labels?.length) payload.labels = body.labels;
  if (body.assignees?.length) payload.assignees = body.assignees;

  const { data, error } = await githubJson<Issue>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (error) return error;

  return Response.json({
    issue: {
      number: data!.number,
      title: data!.title,
      url: data!.html_url,
      state: data!.state,
    },
  });
}

export async function handleIssuesComment(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    issueNumber: number;
    body: string;
  };

  if (!body.owner || !body.repo || !body.issueNumber || !body.body) {
    return Response.json(
      { error: "owner, repo, issueNumber, and body are required" },
      { status: 400 },
    );
  }

  const { data, error } = await githubJson<{
    id: number;
    html_url: string;
    body: string;
  }>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/issues/${body.issueNumber}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.body }),
    },
  );
  if (error) return error;

  return Response.json({ comment: data });
}
