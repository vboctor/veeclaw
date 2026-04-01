import type { Env } from "./auth.ts";
import {
  handleIssuesList,
  handleIssuesGet,
  handleIssuesCreate,
  handleIssuesUpdate,
  handleIssuesAssign,
  handleIssuesStatus,
  handleIssuesNote,
  handleIssuesMonitor,
  handleIssuesUnmonitor,
} from "./issues.ts";
import {
  handleWikiList,
  handleWikiGet,
  handleWikiUpdate,
} from "./wiki.ts";
import {
  handleProjectFilters,
  handleProjectChangelog,
  handleProjectRoadmap,
} from "./projects.ts";
import { handleSearch, handleDiscover } from "./search.ts";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        // Issues
        case "/v1/mantishub/issues/list":      return await handleIssuesList(env, request);
        case "/v1/mantishub/issues/get":        return await handleIssuesGet(env, request);
        case "/v1/mantishub/issues/create":     return await handleIssuesCreate(env, request);
        case "/v1/mantishub/issues/update":     return await handleIssuesUpdate(env, request);
        case "/v1/mantishub/issues/assign":     return await handleIssuesAssign(env, request);
        case "/v1/mantishub/issues/status":     return await handleIssuesStatus(env, request);
        case "/v1/mantishub/issues/note":       return await handleIssuesNote(env, request);
        case "/v1/mantishub/issues/monitor":    return await handleIssuesMonitor(env, request);
        case "/v1/mantishub/issues/unmonitor":  return await handleIssuesUnmonitor(env, request);

        // Wiki
        case "/v1/mantishub/wiki/list":    return await handleWikiList(env, request);
        case "/v1/mantishub/wiki/get":     return await handleWikiGet(env, request);
        case "/v1/mantishub/wiki/update":  return await handleWikiUpdate(env, request);

        // Projects
        case "/v1/mantishub/projects/filters":    return await handleProjectFilters(env, request);
        case "/v1/mantishub/projects/changelog":  return await handleProjectChangelog(env, request);
        case "/v1/mantishub/projects/roadmap":    return await handleProjectRoadmap(env, request);

        // Search
        case "/v1/mantishub/search":    return await handleSearch(env, request);
        case "/v1/mantishub/discover":  return await handleDiscover(env, request);

        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Internal server error";
      return Response.json({ error: message }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
