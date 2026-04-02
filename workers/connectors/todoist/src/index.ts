import type { Env } from "./auth.ts";
import {
  handleTasksList,
  handleTasksGet,
  handleTasksCreate,
  handleTasksUpdate,
  handleTasksSubtasks,
  handleTasksComplete,
  handleTasksReopen,
  handleTasksReminder,
} from "./tasks.ts";
import { handleProjectsList, handleProjectsGet } from "./projects.ts";
import { handleCommentsList, handleCommentsCreate } from "./comments.ts";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      // Tasks
      case "/v1/todoist/tasks/list":     return handleTasksList(env, request);
      case "/v1/todoist/tasks/get":      return handleTasksGet(env, request);
      case "/v1/todoist/tasks/create":   return handleTasksCreate(env, request);
      case "/v1/todoist/tasks/update":   return handleTasksUpdate(env, request);
      case "/v1/todoist/tasks/subtasks": return handleTasksSubtasks(env, request);
      case "/v1/todoist/tasks/complete": return handleTasksComplete(env, request);
      case "/v1/todoist/tasks/reopen":   return handleTasksReopen(env, request);
      case "/v1/todoist/tasks/reminder": return handleTasksReminder(env, request);

      // Projects
      case "/v1/todoist/projects/list":  return handleProjectsList(env, request);
      case "/v1/todoist/projects/get":   return handleProjectsGet(env, request);

      // Comments
      case "/v1/todoist/comments/list":   return handleCommentsList(env, request);
      case "/v1/todoist/comments/create": return handleCommentsCreate(env, request);

      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
