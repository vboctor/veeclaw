import type { Tool } from "@veeclaw/shared";

// ── Route map ────────────────────────────────────────────────────

export const MANTISHUB_TOOL_ROUTES: Record<string, string> = {
  mantishub_issues_list: "/v1/mantishub/issues/list",
  mantishub_issues_get: "/v1/mantishub/issues/get",
  mantishub_issues_create: "/v1/mantishub/issues/create",
  mantishub_issues_update: "/v1/mantishub/issues/update",
  mantishub_issues_assign: "/v1/mantishub/issues/assign",
  mantishub_issues_status: "/v1/mantishub/issues/status",
  mantishub_issues_note: "/v1/mantishub/issues/note",
  mantishub_issues_monitor: "/v1/mantishub/issues/monitor",
  mantishub_issues_unmonitor: "/v1/mantishub/issues/unmonitor",
  mantishub_search: "/v1/mantishub/search",
  mantishub_discover: "/v1/mantishub/discover",
  mantishub_wiki_list: "/v1/mantishub/wiki/list",
  mantishub_wiki_get: "/v1/mantishub/wiki/get",
  mantishub_wiki_update: "/v1/mantishub/wiki/update",
  mantishub_filters_list: "/v1/mantishub/projects/filters",
  mantishub_changelog: "/v1/mantishub/projects/changelog",
  mantishub_roadmap: "/v1/mantishub/projects/roadmap",
};

// ── Instance parameter (shared across all tools) ─────────────────

const INSTANCE_PARAM = {
  type: "string",
  description:
    "MantisHub instance name (e.g., 'tasks', 'bugs'). Omit for the default instance.",
};

// ── Tool definitions ─────────────────────────────────────────────

export const MANTISHUB_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "mantishub_issues_list",
      description:
        "List issues from MantisHub. Use standard filters (assigned, reported, monitored, unassigned, active) for the authenticated user, or use handler/status/priority fields for custom filtering. Use 'handler' to find issues assigned to a specific user.",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          filter: {
            type: "string",
            description:
              "Standard filter: 'assigned' (my issues), 'reported' (reported by me), 'monitored', 'unassigned', 'active', 'any'. Or a saved filter ID. Only use standard filters when querying for the authenticated user — use 'handler' for other users.",
          },
          project: {
            type: "object",
            description: "Project to filter by",
            properties: {
              id: { type: "number", description: "Project ID" },
              name: { type: "string", description: "Project name" },
            },
          },
          handler: {
            description:
              "Filter by assigned user. Use { name: 'username' } for a specific user, or '[none]' for unassigned issues. When filtering by handler, do NOT also set filter to 'assigned'.",
            oneOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  id: { type: "number" },
                },
              },
              { type: "string" },
            ],
          },
          reporter: {
            description: "Filter by reporter",
            oneOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  id: { type: "number" },
                },
              },
              { type: "string" },
            ],
          },
          query: {
            type: "string",
            description: "Free text search query",
          },
          status: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by status names (e.g., ['new', 'assigned', 'in progress', 'review'])",
          },
          priority: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by priority (e.g., ['high', 'urgent', 'immediate'])",
          },
          severity: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by severity (e.g., ['crash', 'block', 'major'])",
          },
          sortBy: {
            type: "string",
            description:
              "Sort field: updated_at, created_at, id, priority, severity, status, handler, summary",
          },
          sortOrder: {
            type: "string",
            enum: ["ASC", "DESC"],
            description: "Sort direction (default: DESC)",
          },
          page: { type: "number", description: "Page number (default: 1)" },
          pageSize: {
            type: "number",
            description: "Results per page (default: 50)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_get",
      description: "Get detailed information about a specific MantisHub issue",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_create",
      description: "Create a new issue in a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          project: {
            type: "object",
            description: "Target project",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
          },
          summary: { type: "string", description: "Issue title/summary" },
          category: {
            type: "object",
            properties: { name: { type: "string" } },
            description: "Issue category",
          },
          description: {
            type: "string",
            description: "Detailed description",
          },
          priority: {
            type: "object",
            properties: { name: { type: "string" } },
            description:
              "Priority: none, low, normal, high, urgent, immediate",
          },
          severity: {
            type: "object",
            properties: { name: { type: "string" } },
            description:
              "Severity: feature, trivial, text, tweak, minor, major, crash, block",
          },
          assignee: {
            type: "object",
            properties: {
              name: { type: "string" },
              id: { type: "number" },
            },
            description: "User to assign the issue to",
          },
          targetVersion: {
            type: "object",
            properties: { name: { type: "string" } },
            description: "Target version for the issue",
          },
        },
        required: ["project", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_update",
      description: "Update fields on an existing MantisHub issue",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID to update" },
          summary: { type: "string" },
          description: { type: "string" },
          category: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          priority: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          severity: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          assignee: {
            type: "object",
            properties: {
              name: { type: "string" },
              id: { type: "number" },
            },
            description: "Set to null to unassign",
          },
          targetVersion: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          fixedInVersion: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_assign",
      description:
        "Assign a MantisHub issue to a specific user using the dedicated assign API",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
          assignee: {
            type: "object",
            properties: {
              name: { type: "string", description: "Username" },
              id: { type: "number", description: "User ID" },
            },
            description: "User to assign to",
          },
          note: {
            type: "string",
            description: "Optional note to add with the assignment",
          },
        },
        required: ["issueId", "assignee"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_status",
      description:
        "Change the status of a MantisHub issue (e.g., new, confirmed, assigned, in progress, resolved, closed)",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
          status: {
            type: "object",
            properties: { name: { type: "string" } },
            description:
              "Target status: new, feedback, acknowledged, confirmed, assigned, in progress, review, resolved, closed",
          },
          resolution: {
            type: "object",
            properties: { name: { type: "string" } },
            description:
              "Resolution (for resolved/closed): open, fixed, reopened, unable to reproduce, not fixable, duplicate, no change required, suspended, won't fix",
          },
          fixedInVersion: {
            type: "object",
            properties: { name: { type: "string" } },
            description: "Version the issue was fixed in",
          },
          note: {
            type: "string",
            description: "Optional note to add with the status change",
          },
        },
        required: ["issueId", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_note",
      description: "Add a comment/note to a MantisHub issue",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
          text: { type: "string", description: "Note/comment text" },
          private: {
            type: "boolean",
            description: "Make the note private (default: false)",
          },
        },
        required: ["issueId", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_monitor",
      description: "Follow/monitor a MantisHub issue to receive notifications",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_issues_unmonitor",
      description: "Stop following/monitoring a MantisHub issue",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          issueId: { type: "number", description: "Issue ID" },
        },
        required: ["issueId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_search",
      description:
        "Search across MantisHub for issues, projects, users, filters, and pages",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          query: { type: "string", description: "Search text" },
          types: {
            type: "array",
            items: { type: "string" },
            description:
              "Types to search: issues, projects, users, filters, pages",
          },
          project: {
            type: "object",
            properties: {
              id: { type: "number" },
              name: { type: "string" },
            },
            description: "Limit search to a specific project",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_discover",
      description:
        "Get MantisHub instance information including version, user context, projects, and available plugins",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_wiki_list",
      description:
        "List or search wiki pages in a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
          query: {
            type: "string",
            description: "Search text to filter pages",
          },
          limit: { type: "number", description: "Max results (default: 25)" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_wiki_get",
      description: "Get the content of a specific wiki page",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
          pageName: { type: "string", description: "Wiki page name" },
        },
        required: ["projectId", "pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_wiki_update",
      description: "Create or update a wiki page in a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
          pageName: { type: "string", description: "Wiki page name" },
          content: { type: "string", description: "Page content (markdown)" },
        },
        required: ["projectId", "pageName", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_filters_list",
      description:
        "List available filters (standard and saved) for a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_changelog",
      description: "Get the changelog for a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
        },
        required: ["projectId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mantishub_roadmap",
      description: "Get the roadmap for a MantisHub project",
      parameters: {
        type: "object",
        properties: {
          instance: INSTANCE_PARAM,
          projectId: { type: "number", description: "Project ID" },
        },
        required: ["projectId"],
      },
    },
  },
];
