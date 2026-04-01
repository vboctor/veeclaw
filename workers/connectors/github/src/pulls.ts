import type { Env } from "./auth.ts";
import { githubJson, githubRaw } from "./github-fetch.ts";

interface PR {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: { login: string };
  created_at: string;
  updated_at: string;
  draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  body: string | null;
  merged_at: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

export async function handlePullsList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    state?: string;
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
  if (body.page) params.set("page", String(body.page));

  const { data, error } = await githubJson<PR[]>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/pulls?${params}`,
  );
  if (error) return error;

  return Response.json({
    pulls: data!.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      url: pr.html_url,
      author: pr.user.login,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      draft: pr.draft,
      head: pr.head.ref,
      base: pr.base.ref,
    })),
  });
}

export async function handlePullsGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    pullNumber: number;
  };

  if (!body.owner || !body.repo || !body.pullNumber) {
    return Response.json(
      { error: "owner, repo, and pullNumber are required" },
      { status: 400 },
    );
  }

  const { data, error } = await githubJson<PR>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/pulls/${body.pullNumber}`,
  );
  if (error) return error;

  return Response.json({ pull: data });
}

export async function handlePullsReviewRequests(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as { perPage?: number };

  const params = new URLSearchParams({
    q: "type:pr state:open review-requested:@me",
    per_page: String(body.perPage || 30),
  });

  const { data, error } = await githubJson<{
    total_count: number;
    items: Array<{
      number: number;
      title: string;
      html_url: string;
      user: { login: string };
      created_at: string;
      pull_request: { html_url: string };
      repository_url: string;
    }>;
  }>(env, `/search/issues?${params}`);
  if (error) return error;

  return Response.json({
    totalCount: data!.total_count,
    pulls: data!.items.map((item) => {
      // Extract owner/repo from repository_url
      const repoPath = item.repository_url.replace(
        "https://api.github.com/repos/",
        "",
      );
      return {
        number: item.number,
        title: item.title,
        url: item.html_url,
        author: item.user.login,
        createdAt: item.created_at,
        repo: repoPath,
      };
    }),
  });
}

export async function handlePullsDiff(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    pullNumber: number;
  };

  if (!body.owner || !body.repo || !body.pullNumber) {
    return Response.json(
      { error: "owner, repo, and pullNumber are required" },
      { status: 400 },
    );
  }

  const { data, error } = await githubRaw(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/pulls/${body.pullNumber}`,
    "application/vnd.github.diff",
  );
  if (error) return error;

  return Response.json({ diff: data });
}

export async function handlePullsFiles(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    pullNumber: number;
    perPage?: number;
  };

  if (!body.owner || !body.repo || !body.pullNumber) {
    return Response.json(
      { error: "owner, repo, and pullNumber are required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams({
    per_page: String(body.perPage || 100),
  });

  const { data, error } = await githubJson<
    Array<{
      sha: string;
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      changes: number;
      patch?: string;
    }>
  >(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/pulls/${body.pullNumber}/files?${params}`,
  );
  if (error) return error;

  return Response.json({
    files: data!.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch,
    })),
  });
}

export async function handlePullsCreateReview(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    pullNumber: number;
    body: string;
    event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
    comments?: Array<{
      path: string;
      position?: number;
      line?: number;
      body: string;
    }>;
  };

  if (!body.owner || !body.repo || !body.pullNumber || !body.event) {
    return Response.json(
      { error: "owner, repo, pullNumber, and event are required" },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    body: body.body || "",
    event: body.event,
  };
  if (body.comments?.length) {
    payload.comments = body.comments;
  }

  const { data, error } = await githubJson<{
    id: number;
    state: string;
    html_url: string;
  }>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/pulls/${body.pullNumber}/reviews`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (error) return error;

  return Response.json({ review: data });
}
