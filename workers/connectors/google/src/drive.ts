import type { Env } from "./auth.ts";
import { googleFetch, googleJson } from "./google-fetch.ts";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";

const FILE_FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,parents";
const LIST_FIELDS = `files(${FILE_FIELDS}),nextPageToken`;

// ── Types ────────────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  parents?: string[];
}

interface FileListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

// Google Docs native MIME types → export targets
const EXPORT_MAP: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.drawing": "image/png",
};

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function handleDriveList(env: Env, request: Request): Promise<Response> {
  const { folderId, pageSize = 50, pageToken } = (await request.json()) as {
    folderId?: string;
    pageSize?: number;
    pageToken?: string;
  };

  const params = new URLSearchParams({
    fields: LIST_FIELDS,
    pageSize: String(pageSize),
    orderBy: "modifiedTime desc",
  });

  if (folderId) params.set("q", `'${folderId}' in parents and trashed = false`);
  else params.set("q", "trashed = false");

  if (pageToken) params.set("pageToken", pageToken);

  const { data, error } = await googleJson<FileListResponse>(
    env,
    `${DRIVE_BASE}/files?${params}`,
  );
  if (error) return error;

  return Response.json({ files: data?.files ?? [], nextPageToken: data?.nextPageToken });
}

export async function handleDriveSearch(env: Env, request: Request): Promise<Response> {
  const { query, pageSize = 20 } = (await request.json()) as {
    query: string;
    pageSize?: number;
  };

  if (!query) return Response.json({ error: "query is required" }, { status: 400 });

  const q = `(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}') and trashed = false`;

  const params = new URLSearchParams({
    q,
    fields: LIST_FIELDS,
    pageSize: String(pageSize),
    orderBy: "modifiedTime desc",
  });

  const { data, error } = await googleJson<FileListResponse>(
    env,
    `${DRIVE_BASE}/files?${params}`,
  );
  if (error) return error;

  return Response.json({ files: data?.files ?? [] });
}

export async function handleDriveGet(env: Env, request: Request): Promise<Response> {
  const { fileId } = (await request.json()) as { fileId: string };

  if (!fileId) return Response.json({ error: "fileId is required" }, { status: 400 });

  const params = new URLSearchParams({ fields: FILE_FIELDS });

  const { data, error } = await googleJson<DriveFile>(
    env,
    `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?${params}`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleDriveDownload(env: Env, request: Request): Promise<Response> {
  const { fileId, mimeType } = (await request.json()) as {
    fileId: string;
    mimeType?: string;
  };

  if (!fileId) return Response.json({ error: "fileId is required" }, { status: 400 });

  // First, get file metadata to determine type
  const { data: meta, error: metaError } = await googleJson<DriveFile>(
    env,
    `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`,
  );
  if (metaError) return metaError;
  if (!meta) return Response.json({ error: "File not found" }, { status: 404 });

  const isGoogleDoc = meta.mimeType.startsWith("application/vnd.google-apps.");

  if (isGoogleDoc) {
    // Export Google Docs/Sheets/Slides to a portable format
    const exportMime = mimeType || EXPORT_MAP[meta.mimeType];
    if (!exportMime) {
      return Response.json(
        { error: `No export format for ${meta.mimeType}. Specify mimeType.` },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({ mimeType: exportMime });
    const res = await googleFetch(
      env,
      `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}/export?${params}`,
    );

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: text, status: res.status }, { status: res.status });
    }

    const content = await res.text();
    return Response.json({ name: meta.name, mimeType: exportMime, content });
  }

  // Binary file — check size limit (10MB)
  const size = meta.size ? parseInt(meta.size, 10) : 0;
  if (size > 10 * 1024 * 1024) {
    return Response.json(
      { error: `File too large (${size} bytes). Max 10MB for download.` },
      { status: 413 },
    );
  }

  const res = await googleFetch(
    env,
    `${DRIVE_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text, status: res.status }, { status: res.status });
  }

  // Return binary as base64
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);

  return Response.json({ name: meta.name, mimeType: meta.mimeType, base64 });
}
