import type { Tool } from "@veeclaw/shared";

// ── Route maps ───────────────────────────────────────────────────

export const GITHUB_REPOS_TOOL_ROUTES: Record<string, string> = {
  github_repos_list: "/v1/github/repos/list",
  github_repos_get: "/v1/github/repos/get",
  github_repos_search: "/v1/github/repos/search",
  github_orgs_list: "/v1/github/orgs/list",
};

export const GITHUB_PULLS_TOOL_ROUTES: Record<string, string> = {
  github_pulls_list: "/v1/github/pulls/list",
  github_pulls_get: "/v1/github/pulls/get",
  github_pulls_review_requests: "/v1/github/pulls/review_requests",
  github_pulls_diff: "/v1/github/pulls/diff",
  github_pulls_files: "/v1/github/pulls/files",
  github_pulls_create_review: "/v1/github/pulls/create_review",
};

export const GITHUB_ISSUES_TOOL_ROUTES: Record<string, string> = {
  github_issues_list: "/v1/github/issues/list",
  github_issues_get: "/v1/github/issues/get",
  github_issues_search: "/v1/github/issues/search",
  github_issues_create: "/v1/github/issues/create",
  github_issues_comment: "/v1/github/issues/comment",
};

export const GITHUB_CODE_TOOL_ROUTES: Record<string, string> = {
  github_code_get: "/v1/github/code/get",
  github_code_search: "/v1/github/code/search",
  github_code_tree: "/v1/github/code/tree",
};

export const GITHUB_TOOL_ROUTES: Record<string, string> = {
  ...GITHUB_REPOS_TOOL_ROUTES,
  ...GITHUB_PULLS_TOOL_ROUTES,
  ...GITHUB_ISSUES_TOOL_ROUTES,
  ...GITHUB_CODE_TOOL_ROUTES,
};


// ── Tool definitions ─────────────────────────────────────────────

export const GITHUB_REPOS_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "github_repos_list",
      description:
        "List repositories for the authenticated user, or for a specific organization",
      parameters: {
        type: "object",
        properties: {
          org: {
            type: "string",
            description:
              "Organization login name. If omitted, lists the user's own repos.",
          },
          type: {
            type: "string",
            enum: ["all", "owner", "public", "private", "member"],
            description: "Filter by repo type (default: all)",
          },
          sort: {
            type: "string",
            enum: ["created", "updated", "pushed", "full_name"],
            description: "Sort field (default: updated)",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 30, max: 100)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_repos_get",
      description: "Get detailed information about a specific repository",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_repos_search",
      description:
        "Search for repositories on GitHub using search syntax (e.g., 'language:typescript stars:>100')",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "GitHub search query",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_orgs_list",
      description:
        "List organizations the authenticated user belongs to",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export const GITHUB_PULLS_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "github_pulls_list",
      description: "List pull requests for a repository",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by state (default: open)",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 30)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pulls_get",
      description:
        "Get detailed information about a specific pull request including additions, deletions, and changed files count",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: {
            type: "number",
            description: "Pull request number",
          },
        },
        required: ["owner", "repo", "pullNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pulls_review_requests",
      description:
        "List open pull requests where the authenticated user has been requested for review",
      parameters: {
        type: "object",
        properties: {
          perPage: {
            type: "number",
            description: "Results per page (default: 30)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pulls_diff",
      description:
        "Get the raw diff for a pull request, showing all code changes",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: {
            type: "number",
            description: "Pull request number",
          },
        },
        required: ["owner", "repo", "pullNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pulls_files",
      description:
        "List files changed in a pull request with per-file diffs (patches)",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: {
            type: "number",
            description: "Pull request number",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 100)",
          },
        },
        required: ["owner", "repo", "pullNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_pulls_create_review",
      description:
        "Create a review on a pull request. Can approve, request changes, or comment. Requires user confirmation before submitting APPROVE or REQUEST_CHANGES.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          pullNumber: {
            type: "number",
            description: "Pull request number",
          },
          body: {
            type: "string",
            description: "Review summary comment",
          },
          event: {
            type: "string",
            enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"],
            description: "Review action",
          },
          comments: {
            type: "array",
            description: "Inline review comments on specific lines",
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: "File path relative to repo root",
                },
                line: {
                  type: "number",
                  description: "Line number in the diff to comment on",
                },
                body: {
                  type: "string",
                  description: "Comment text",
                },
              },
              required: ["path", "line", "body"],
            },
          },
        },
        required: ["owner", "repo", "pullNumber", "event"],
      },
    },
  },
];

export const GITHUB_ISSUES_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "github_issues_list",
      description: "List issues for a repository (excludes pull requests)",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          state: {
            type: "string",
            enum: ["open", "closed", "all"],
            description: "Filter by state (default: open)",
          },
          labels: {
            type: "string",
            description:
              "Comma-separated list of label names to filter by",
          },
          assignee: {
            type: "string",
            description:
              "Filter by assignee username, or 'none' for unassigned",
          },
          sort: {
            type: "string",
            enum: ["created", "updated", "comments"],
            description: "Sort field (default: created)",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 30)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_issues_get",
      description: "Get detailed information about a specific issue",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issueNumber: {
            type: "number",
            description: "Issue number",
          },
        },
        required: ["owner", "repo", "issueNumber"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_issues_search",
      description:
        "Search for issues across GitHub using search syntax (e.g., 'repo:owner/name is:open label:bug')",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "GitHub issue search query",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_issues_create",
      description: "Create a new issue in a repository",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          title: { type: "string", description: "Issue title" },
          body: {
            type: "string",
            description: "Issue body (markdown supported)",
          },
          labels: {
            type: "array",
            items: { type: "string" },
            description: "Labels to apply",
          },
          assignees: {
            type: "array",
            items: { type: "string" },
            description: "Usernames to assign",
          },
        },
        required: ["owner", "repo", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_issues_comment",
      description: "Add a comment to an issue or pull request",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          issueNumber: {
            type: "number",
            description: "Issue or PR number",
          },
          body: {
            type: "string",
            description: "Comment body (markdown supported)",
          },
        },
        required: ["owner", "repo", "issueNumber", "body"],
      },
    },
  },
];

export const GITHUB_CODE_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "github_code_get",
      description:
        "Get the contents of a file from a repository. Returns decoded text content.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          path: {
            type: "string",
            description: "File path relative to repo root",
          },
          ref: {
            type: "string",
            description:
              "Branch, tag, or commit SHA (default: repo default branch)",
          },
        },
        required: ["owner", "repo", "path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_code_search",
      description:
        "Search for code across GitHub repositories (e.g., 'addClass repo:owner/name language:typescript')",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "GitHub code search query",
          },
          perPage: {
            type: "number",
            description: "Results per page (default: 10)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "github_code_tree",
      description:
        "Get the full file tree of a repository (recursive listing of all files and directories)",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          ref: {
            type: "string",
            description:
              "Branch, tag, or commit SHA (default: HEAD)",
          },
        },
        required: ["owner", "repo"],
      },
    },
  },
];

export const GITHUB_TOOLS: Tool[] = [
  ...GITHUB_REPOS_TOOLS,
  ...GITHUB_PULLS_TOOLS,
  ...GITHUB_ISSUES_TOOLS,
  ...GITHUB_CODE_TOOLS,
];
