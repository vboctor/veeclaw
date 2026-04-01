import type { Env } from "./auth.ts";
import { githubJson } from "./github-fetch.ts";

export async function handleCodeGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  };

  if (!body.owner || !body.repo || !body.path) {
    return Response.json(
      { error: "owner, repo, and path are required" },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  if (body.ref) params.set("ref", body.ref);

  const queryStr = params.toString();
  const url = `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/contents/${body.path}${queryStr ? `?${queryStr}` : ""}`;

  const { data, error } = await githubJson<{
    type: string;
    encoding?: string;
    content?: string;
    size: number;
    name: string;
    path: string;
    sha: string;
    html_url: string;
  }>(env, url);
  if (error) return error;

  let content = data!.content;
  if (data!.encoding === "base64" && content) {
    content = atob(content.replace(/\n/g, ""));
  }

  return Response.json({
    file: {
      name: data!.name,
      path: data!.path,
      sha: data!.sha,
      size: data!.size,
      type: data!.type,
      url: data!.html_url,
      content,
    },
  });
}

export async function handleCodeSearch(
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
    items: Array<{
      name: string;
      path: string;
      sha: string;
      html_url: string;
      repository: { full_name: string };
      text_matches?: Array<{ fragment: string }>;
    }>;
  }>(env, `/search/code?${params}`);
  if (error) return error;

  return Response.json({
    totalCount: data!.total_count,
    results: data!.items.map((item) => ({
      name: item.name,
      path: item.path,
      repo: item.repository.full_name,
      url: item.html_url,
      matches: item.text_matches?.map((m) => m.fragment),
    })),
  });
}

export async function handleCodeTree(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    owner: string;
    repo: string;
    ref?: string;
  };

  if (!body.owner || !body.repo) {
    return Response.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }

  const ref = body.ref || "HEAD";

  const { data, error } = await githubJson<{
    sha: string;
    tree: Array<{
      path: string;
      mode: string;
      type: string;
      size?: number;
      sha: string;
    }>;
    truncated: boolean;
  }>(
    env,
    `/repos/${encodeURIComponent(body.owner)}/${encodeURIComponent(body.repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  if (error) return error;

  return Response.json({
    sha: data!.sha,
    truncated: data!.truncated,
    tree: data!.tree.map((t) => ({
      path: t.path,
      type: t.type,
      size: t.size,
    })),
  });
}
