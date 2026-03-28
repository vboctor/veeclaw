import type { Tool } from "@scaf/shared";

/** Tool route mapping: tool name → Google Connector HTTP path */
export const GOOGLE_TOOL_ROUTES: Record<string, string> = {
  gmail_search: "/v1/gmail/search",
  gmail_read: "/v1/gmail/read",
  gmail_send: "/v1/gmail/send",
  gmail_draft: "/v1/gmail/draft",
  gmail_unread: "/v1/gmail/unread",
  calendar_list: "/v1/calendar/list",
  calendar_get: "/v1/calendar/get",
  calendar_create: "/v1/calendar/create",
  calendar_update: "/v1/calendar/update",
  drive_list: "/v1/drive/list",
  drive_search: "/v1/drive/search",
  drive_get: "/v1/drive/get",
  drive_download: "/v1/drive/download",
};

export const GOOGLE_TOOLS: Tool[] = [
  // ── Gmail ─────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "gmail_search",
      description: "Search Gmail messages using Gmail search syntax (e.g. 'from:alice subject:report')",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Gmail search query" },
          maxResults: { type: "number", description: "Max messages to return (default 10)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_read",
      description: "Read the full content of a specific Gmail message by ID",
      parameters: {
        type: "object",
        properties: {
          messageId: { type: "string", description: "Gmail message ID" },
          format: { type: "string", enum: ["full", "metadata", "minimal"], description: "Response detail level (default 'full')" },
        },
        required: ["messageId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_send",
      description: "Send an email via Gmail",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (plain text)" },
          cc: { type: "string", description: "CC recipients (comma-separated)" },
          bcc: { type: "string", description: "BCC recipients (comma-separated)" },
          inReplyTo: { type: "string", description: "Message-ID to reply to (for threading)" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_draft",
      description: "Create a draft email in Gmail",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body (plain text)" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gmail_unread",
      description: "List unread Gmail messages since a given date/time",
      parameters: {
        type: "object",
        properties: {
          since: { type: "string", description: "ISO 8601 datetime (e.g. '2026-03-27T00:00:00Z')" },
          maxResults: { type: "number", description: "Max messages to return (default 20)" },
        },
        required: ["since"],
      },
    },
  },

  // ── Calendar ──────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "calendar_list",
      description: "List Google Calendar events in a time range",
      parameters: {
        type: "object",
        properties: {
          timeMin: { type: "string", description: "Start of range (ISO 8601)" },
          timeMax: { type: "string", description: "End of range (ISO 8601)" },
          calendarId: { type: "string", description: "Calendar ID (default 'primary')" },
          maxResults: { type: "number", description: "Max events (default 50)" },
        },
        required: ["timeMin", "timeMax"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_get",
      description: "Get details of a specific Google Calendar event",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "Calendar event ID" },
          calendarId: { type: "string", description: "Calendar ID (default 'primary')" },
        },
        required: ["eventId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_create",
      description: "Create a new Google Calendar event",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          start: { type: "string", description: "Start time (ISO 8601)" },
          end: { type: "string", description: "End time (ISO 8601)" },
          description: { type: "string", description: "Event description" },
          location: { type: "string", description: "Event location" },
          attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses" },
          calendarId: { type: "string", description: "Calendar ID (default 'primary')" },
        },
        required: ["summary", "start", "end"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar_update",
      description: "Update an existing Google Calendar event",
      parameters: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "Calendar event ID" },
          calendarId: { type: "string", description: "Calendar ID (default 'primary')" },
          updates: {
            type: "object",
            description: "Fields to update (summary, start, end, description, location, attendees)",
          },
        },
        required: ["eventId", "updates"],
      },
    },
  },

  // ── Drive ─────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "drive_list",
      description: "List files in Google Drive, optionally within a specific folder",
      parameters: {
        type: "object",
        properties: {
          folderId: { type: "string", description: "Folder ID to list (default: root)" },
          pageSize: { type: "number", description: "Number of files (default 50)" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_search",
      description: "Search for files in Google Drive by name or content",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          pageSize: { type: "number", description: "Number of results (default 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_get",
      description: "Get metadata for a specific Google Drive file",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "Drive file ID" },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "drive_download",
      description: "Download or export a Google Drive file's content. Google Docs are exported as plain text, Sheets as CSV.",
      parameters: {
        type: "object",
        properties: {
          fileId: { type: "string", description: "Drive file ID" },
          mimeType: { type: "string", description: "Export MIME type (for Google Docs formats)" },
        },
        required: ["fileId"],
      },
    },
  },
];
