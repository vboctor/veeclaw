import type { Env } from "./auth.ts";
import {
  handleReposList,
  handleReposGet,
  handleReposSearch,
  handleOrgsList,
} from "./repos.ts";
import {
  handlePullsList,
  handlePullsGet,
  handlePullsReviewRequests,
  handlePullsDiff,
  handlePullsFiles,
  handlePullsCreateReview,
} from "./pulls.ts";
import {
  handleIssuesList,
  handleIssuesGet,
  handleIssuesSearch,
  handleIssuesCreate,
  handleIssuesComment,
} from "./issues.ts";
import {
  handleCodeGet,
  handleCodeSearch,
  handleCodeTree,
} from "./code.ts";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      // Repos
      case "/v1/github/repos/list":     return handleReposList(env, request);
      case "/v1/github/repos/get":      return handleReposGet(env, request);
      case "/v1/github/repos/search":   return handleReposSearch(env, request);
      case "/v1/github/orgs/list":      return handleOrgsList(env, request);

      // Pull Requests
      case "/v1/github/pulls/list":             return handlePullsList(env, request);
      case "/v1/github/pulls/get":              return handlePullsGet(env, request);
      case "/v1/github/pulls/review_requests":  return handlePullsReviewRequests(env, request);
      case "/v1/github/pulls/diff":             return handlePullsDiff(env, request);
      case "/v1/github/pulls/files":            return handlePullsFiles(env, request);
      case "/v1/github/pulls/create_review":    return handlePullsCreateReview(env, request);

      // Issues
      case "/v1/github/issues/list":    return handleIssuesList(env, request);
      case "/v1/github/issues/get":     return handleIssuesGet(env, request);
      case "/v1/github/issues/search":  return handleIssuesSearch(env, request);
      case "/v1/github/issues/create":  return handleIssuesCreate(env, request);
      case "/v1/github/issues/comment": return handleIssuesComment(env, request);

      // Code
      case "/v1/github/code/get":       return handleCodeGet(env, request);
      case "/v1/github/code/search":    return handleCodeSearch(env, request);
      case "/v1/github/code/tree":      return handleCodeTree(env, request);

      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
