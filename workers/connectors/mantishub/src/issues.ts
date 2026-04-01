import type { Env } from "./auth.ts";
import { resolveInstance } from "./auth.ts";
import { mantishubJson, mantishubFetch } from "./mantishub-fetch.ts";

export async function handleIssuesList(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    filter?: string | number;
    project?: { id?: number; name?: string };
    query?: string;
    handler?: { name?: string; id?: number } | string;
    status?: string[];
    priority?: string[];
    severity?: string[];
    reporter?: { name?: string; id?: number } | string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  };

  const config = await resolveInstance(env, body.instance);

  // Build the issues_list request body for ApiX
  const apiBody: Record<string, unknown> = {};

  if (body.project) {
    apiBody.project = body.project;
  }

  // Determine if we need custom criteria beyond the filter
  const hasCustomCriteria = body.handler || body.status || body.priority ||
    body.severity || body.reporter || body.query;

  if (body.filter && !hasCustomCriteria) {
    if (typeof body.filter === "number") {
      // Saved filter by ID
      apiBody.filter = { type: "saved", id: body.filter };
    } else if (
      ["assigned", "reported", "monitored", "unassigned", "active", "any"].includes(
        body.filter,
      )
    ) {
      apiBody.filter = { type: "standard", id: body.filter };
    } else {
      // Treat as query string
      apiBody.filter = { type: "custom", criteria: { search: body.filter } };
    }
  }

  // Build custom filter criteria when specific fields are provided
  if (hasCustomCriteria) {
    const criteria: Record<string, unknown> = {};

    if (body.handler) {
      const h = typeof body.handler === "string"
        ? { name: body.handler }
        : body.handler;
      criteria.handler = [h];
    }

    if (body.reporter) {
      const r = typeof body.reporter === "string"
        ? { name: body.reporter }
        : body.reporter;
      criteria.reporter = [r];
    }

    if (body.status) {
      criteria.status = body.status.map((s) => ({ name: s }));
    }

    if (body.priority) {
      criteria.priority = body.priority.map((p) => ({ name: p }));
    }

    if (body.severity) {
      criteria.severity = body.severity.map((s) => ({ name: s }));
    }

    if (body.query) {
      criteria.search = body.query;
    }

    apiBody.filter = { type: "custom", criteria };
  }

  if (body.page) apiBody.page = body.page;
  if (body.pageSize) apiBody.page_size = body.pageSize;
  if (body.sortBy) apiBody.sort_by = body.sortBy;
  if (body.sortOrder) apiBody.sort_order = body.sortOrder;

  const { data, error } = await mantishubJson<{
    issues: unknown[];
    total_count: number;
    page: number;
    page_size: number;
  }>(config, "/issues_list", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesGet(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
  };

  if (!body.issueId) {
    return Response.json(
      { error: "issueId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/pages/view`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesCreate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    project: { id?: number; name?: string };
    summary: string;
    category?: { name: string };
    description?: string;
    priority?: { name: string };
    severity?: { name: string };
    reproducibility?: { name: string };
    assignee?: { name?: string; id?: number };
    targetVersion?: { name: string };
    tags?: Array<{ name: string }>;
    customFields?: Array<{ field: { name: string }; value: string }>;
  };

  if (!body.project || !body.summary) {
    return Response.json(
      { error: "project and summary are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {
    project: body.project,
    summary: body.summary,
  };

  if (body.category) apiBody.category = body.category;
  if (body.description) apiBody.description = body.description;
  if (body.priority) apiBody.priority = body.priority;
  if (body.severity) apiBody.severity = body.severity;
  if (body.reproducibility) apiBody.reproducibility = body.reproducibility;
  if (body.assignee) apiBody.handler = body.assignee;
  if (body.targetVersion) apiBody.target_version = body.targetVersion;
  if (body.tags) apiBody.tags = body.tags;
  if (body.customFields) apiBody.custom_fields = body.customFields;

  const { data, error } = await mantishubJson<{
    issue: { id: number };
    issue_view: unknown;
  }>(config, "/issues", {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesUpdate(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
    summary?: string;
    description?: string;
    category?: { name: string };
    priority?: { name: string };
    severity?: { name: string };
    reproducibility?: { name: string };
    assignee?: { name?: string; id?: number } | null;
    targetVersion?: { name: string };
    fixedInVersion?: { name: string };
    additionalInformation?: string;
    stepsToReproduce?: string;
    tags?: Array<{ name: string }>;
    customFields?: Array<{ field: { name: string }; value: string }>;
  };

  if (!body.issueId) {
    return Response.json(
      { error: "issueId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {};
  if (body.summary) apiBody.summary = body.summary;
  if (body.description) apiBody.description = body.description;
  if (body.category) apiBody.category = body.category;
  if (body.priority) apiBody.priority = body.priority;
  if (body.severity) apiBody.severity = body.severity;
  if (body.reproducibility) apiBody.reproducibility = body.reproducibility;
  if (body.assignee !== undefined) apiBody.handler = body.assignee;
  if (body.targetVersion) apiBody.target_version = body.targetVersion;
  if (body.fixedInVersion) apiBody.fixed_in_version = body.fixedInVersion;
  if (body.additionalInformation)
    apiBody.additional_information = body.additionalInformation;
  if (body.stepsToReproduce)
    apiBody.steps_to_reproduce = body.stepsToReproduce;
  if (body.tags) apiBody.tags = body.tags;
  if (body.customFields) apiBody.custom_fields = body.customFields;

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/update`,
    {
      method: "PATCH",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesAssign(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
    assignee: { name?: string; id?: number };
    note?: string;
  };

  if (!body.issueId || !body.assignee) {
    return Response.json(
      { error: "issueId and assignee are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {
    handler: body.assignee,
  };
  if (body.note) {
    apiBody.note = { text: body.note };
  }

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/assign`,
    {
      method: "POST",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesStatus(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
    status: { name: string };
    resolution?: { name: string };
    fixedInVersion?: { name: string };
    targetVersion?: { name: string };
    note?: string;
  };

  if (!body.issueId || !body.status) {
    return Response.json(
      { error: "issueId and status are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {
    status: body.status,
  };
  if (body.resolution) apiBody.resolution = body.resolution;
  if (body.fixedInVersion) apiBody.fixed_in_version = body.fixedInVersion;
  if (body.targetVersion) apiBody.target_version = body.targetVersion;
  if (body.note) {
    apiBody.note = { text: body.note };
  }

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/status`,
    {
      method: "POST",
      body: JSON.stringify(apiBody),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesNote(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
    text: string;
    private?: boolean;
  };

  if (!body.issueId || !body.text) {
    return Response.json(
      { error: "issueId and text are required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const apiBody: Record<string, unknown> = {
    text: body.text,
  };
  if (body.private) {
    apiBody.view_state = { name: "private" };
  }

  const { data, error } = await mantishubJson<{
    id: number;
    issue_view: unknown;
  }>(config, `/issues/${body.issueId}/notes`, {
    method: "POST",
    body: JSON.stringify(apiBody),
  });
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesMonitor(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
  };

  if (!body.issueId) {
    return Response.json(
      { error: "issueId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/monitor`,
    {
      method: "POST",
      body: JSON.stringify({ users: [{ id: "[myself]" }] }),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleIssuesUnmonitor(
  env: Env,
  request: Request,
): Promise<Response> {
  const body = (await request.json()) as {
    instance?: string;
    issueId: number;
  };

  if (!body.issueId) {
    return Response.json(
      { error: "issueId is required" },
      { status: 400 },
    );
  }

  const config = await resolveInstance(env, body.instance);

  const { data, error } = await mantishubJson<{ issue_view: unknown }>(
    config,
    `/issues/${body.issueId}/unmonitor`,
    {
      method: "POST",
      body: JSON.stringify({ users: [{ id: "[myself]" }] }),
    },
  );
  if (error) return error;

  return Response.json(data);
}
