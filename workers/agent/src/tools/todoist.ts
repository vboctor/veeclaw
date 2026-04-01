import type { Tool } from "@veeclaw/shared";

// ── Route map ────────────────────────────────────────────────────

export const TODOIST_TOOL_ROUTES: Record<string, string> = {
  todoist_tasks_list: "/v1/todoist/tasks/list",
  todoist_tasks_get: "/v1/todoist/tasks/get",
  todoist_tasks_create: "/v1/todoist/tasks/create",
  todoist_tasks_update: "/v1/todoist/tasks/update",
  todoist_tasks_subtasks: "/v1/todoist/tasks/subtasks",
  todoist_tasks_complete: "/v1/todoist/tasks/complete",
  todoist_tasks_reopen: "/v1/todoist/tasks/reopen",
  todoist_projects_list: "/v1/todoist/projects/list",
  todoist_projects_get: "/v1/todoist/projects/get",
  todoist_comments_list: "/v1/todoist/comments/list",
  todoist_comments_create: "/v1/todoist/comments/create",
};

// ── Tool definitions ─────────────────────────────────────────────

export const TODOIST_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "todoist_tasks_list",
      description:
        "List active Todoist tasks, optionally filtered by project, section, label, or Todoist filter query",
      parameters: {
        type: "object",
        properties: {
          projectId: {
            type: "string",
            description: "Filter by project ID",
          },
          sectionId: {
            type: "string",
            description: "Filter by section ID",
          },
          label: {
            type: "string",
            description: "Filter by label name",
          },
          search: {
            description:
              "Search tasks by content/description. A single string or an array of phrases (OR match). Case-insensitive. Examples: 'tax return' or ['tax return', 'insurance', 'lease']",
            oneOf: [
              { type: "string" },
              { type: "array", items: { type: "string" } },
            ],
          },
          limit: {
            type: "number",
            description:
              "Max number of tasks to return. Results are sorted by most recently created first.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_get",
      description: "Get details of a specific Todoist task",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_create",
      description:
        "Create a new Todoist task. Supports natural language due dates via dueString (e.g., 'tomorrow at 2pm', 'every monday').",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Task title (required)" },
          description: { type: "string", description: "Task description" },
          projectId: {
            type: "string",
            description: "Project ID to add the task to",
          },
          sectionId: {
            type: "string",
            description: "Section ID within the project",
          },
          parentId: {
            type: "string",
            description: "Parent task ID (to create a subtask)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply",
          },
          priority: {
            type: "number",
            description:
              "Priority: 1 (urgent/p1), 2 (high/p2), 3 (medium/p3), 4 (normal/p4). Matches Todoist UI.",
          },
          dueString: {
            type: "string",
            description:
              "Natural language due date (e.g., 'tomorrow at 2pm', 'every monday', 'in 3 days')",
          },
          dueDate: {
            type: "string",
            description: "Due date in YYYY-MM-DD format (date only, no time)",
          },
          dueDatetime: {
            type: "string",
            description:
              "Due datetime in RFC3339 format (e.g., '2026-04-01T14:00:00Z')",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_update",
      description: "Update an existing Todoist task",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID to update" },
          content: { type: "string", description: "New task title" },
          description: { type: "string", description: "New description" },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "New labels (replaces existing)",
          },
          priority: {
            type: "number",
            description:
              "New priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)",
          },
          dueString: {
            type: "string",
            description: "New due date in natural language",
          },
          dueDate: {
            type: "string",
            description: "New due date (YYYY-MM-DD)",
          },
          dueDatetime: {
            type: "string",
            description: "New due datetime (RFC3339)",
          },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_subtasks",
      description: "List subtasks of a specific Todoist task",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Parent task ID to get subtasks for",
          },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_complete",
      description: "Mark a Todoist task as complete",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID to complete" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_tasks_reopen",
      description: "Reopen a previously completed Todoist task",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Task ID to reopen" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_projects_list",
      description: "List all Todoist projects",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_projects_get",
      description: "Get details of a specific Todoist project",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Project ID" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_comments_list",
      description: "List comments on a Todoist task or project",
      parameters: {
        type: "object",
        properties: {
          taskId: {
            type: "string",
            description: "Task ID to get comments for",
          },
          projectId: {
            type: "string",
            description: "Project ID to get comments for",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todoist_comments_create",
      description: "Add a comment to a Todoist task or project",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Comment text" },
          taskId: {
            type: "string",
            description: "Task ID to comment on",
          },
          projectId: {
            type: "string",
            description: "Project ID to comment on",
          },
        },
        required: ["content"],
      },
    },
  },
];
