import type { Env } from "./auth.ts";
import { googleFetch, googleJson } from "./google-fetch.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// ── Types ────────────────────────────────────────────────────────────────────

interface MessageListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size: number };
    }>;
  };
  internalDate: string;
}

// ── Helpers ──────────────────────────────────────────────��───────────────────

function base64url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  lines.push("", opts.body);
  return lines.join("\r\n");
}

// ── Handlers ─────��──────────────────────────────��────────────────────────────

export async function handleGmailSearch(env: Env, request: Request): Promise<Response> {
  const { query, maxResults = 10 } = (await request.json()) as {
    query: string;
    maxResults?: number;
  };

  if (!query) return Response.json({ error: "query is required" }, { status: 400 });

  // List message IDs
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
  });
  const { data: list, error } = await googleJson<MessageListResponse>(
    env,
    `${GMAIL_BASE}/messages?${params}`,
  );
  if (error) return error;
  if (!list?.messages?.length) return Response.json({ messages: [] });

  // Batch-fetch message metadata
  const messages = await Promise.all(
    list.messages.map(async ({ id }) => {
      const { data } = await googleJson<GmailMessage>(
        env,
        `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      return data;
    }),
  );

  return Response.json({ messages: messages.filter(Boolean) });
}

export async function handleGmailRead(env: Env, request: Request): Promise<Response> {
  const { messageId, format = "full" } = (await request.json()) as {
    messageId: string;
    format?: "full" | "metadata" | "minimal";
  };

  if (!messageId) return Response.json({ error: "messageId is required" }, { status: 400 });

  const { data, error } = await googleJson<GmailMessage>(
    env,
    `${GMAIL_BASE}/messages/${messageId}?format=${format}`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleGmailSend(env: Env, request: Request): Promise<Response> {
  const opts = (await request.json()) as {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    inReplyTo?: string;
  };

  if (!opts.to || !opts.subject || !opts.body) {
    return Response.json({ error: "to, subject, and body are required" }, { status: 400 });
  }

  const raw = base64url(buildMimeMessage(opts));

  const { data, error } = await googleJson<{ id: string; threadId: string }>(
    env,
    `${GMAIL_BASE}/messages/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleGmailDraft(env: Env, request: Request): Promise<Response> {
  const opts = (await request.json()) as {
    to: string;
    subject: string;
    body: string;
  };

  if (!opts.to || !opts.subject || !opts.body) {
    return Response.json({ error: "to, subject, and body are required" }, { status: 400 });
  }

  const raw = base64url(buildMimeMessage(opts));

  const { data, error } = await googleJson<{ id: string; message: { id: string } }>(
    env,
    `${GMAIL_BASE}/drafts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } }),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleGmailUnread(env: Env, request: Request): Promise<Response> {
  const { since, maxResults = 20 } = (await request.json()) as {
    since: string;
    maxResults?: number;
  };

  if (!since) return Response.json({ error: "since (ISO date) is required" }, { status: 400 });

  const epoch = Math.floor(new Date(since).getTime() / 1000);
  const params = new URLSearchParams({
    q: `is:unread after:${epoch}`,
    maxResults: String(maxResults),
  });

  const { data: list, error } = await googleJson<MessageListResponse>(
    env,
    `${GMAIL_BASE}/messages?${params}`,
  );
  if (error) return error;
  if (!list?.messages?.length) return Response.json({ messages: [] });

  const messages = await Promise.all(
    list.messages.map(async ({ id }) => {
      const { data } = await googleJson<GmailMessage>(
        env,
        `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      );
      return data;
    }),
  );

  return Response.json({ messages: messages.filter(Boolean) });
}

export async function handleGmailStar(env: Env, request: Request): Promise<Response> {
  const { messageId, star = true } = (await request.json()) as {
    messageId: string;
    star?: boolean;
  };

  if (!messageId) return Response.json({ error: "messageId is required" }, { status: 400 });

  const { data, error } = await googleJson<{ id: string; labelIds: string[] }>(
    env,
    `${GMAIL_BASE}/messages/${messageId}/modify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addLabelIds: star ? ["STARRED"] : [],
        removeLabelIds: star ? [] : ["STARRED"],
      }),
    },
  );
  if (error) return error;

  return Response.json(data);
}
