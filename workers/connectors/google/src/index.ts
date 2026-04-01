import type { Env } from "./auth.ts";
import {
  handleGmailSearch,
  handleGmailRead,
  handleGmailSend,
  handleGmailDraft,
  handleGmailUnread,
  handleGmailStar,
} from "./gmail.ts";
import {
  handleCalendarList,
  handleCalendarGet,
  handleCalendarCreate,
  handleCalendarUpdate,
  handleCalendarDelete,
} from "./calendar.ts";
import {
  handleDriveList,
  handleDriveSearch,
  handleDriveGet,
  handleDriveDownload,
} from "./drive.ts";

export type { Env };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      // Gmail
      case "/v1/gmail/search":   return handleGmailSearch(env, request);
      case "/v1/gmail/read":     return handleGmailRead(env, request);
      case "/v1/gmail/send":     return handleGmailSend(env, request);
      case "/v1/gmail/draft":    return handleGmailDraft(env, request);
      case "/v1/gmail/unread":   return handleGmailUnread(env, request);
      case "/v1/gmail/star":    return handleGmailStar(env, request);

      // Calendar
      case "/v1/calendar/list":   return handleCalendarList(env, request);
      case "/v1/calendar/get":    return handleCalendarGet(env, request);
      case "/v1/calendar/create": return handleCalendarCreate(env, request);
      case "/v1/calendar/update": return handleCalendarUpdate(env, request);
      case "/v1/calendar/delete": return handleCalendarDelete(env, request);

      // Drive
      case "/v1/drive/list":     return handleDriveList(env, request);
      case "/v1/drive/search":   return handleDriveSearch(env, request);
      case "/v1/drive/get":      return handleDriveGet(env, request);
      case "/v1/drive/download": return handleDriveDownload(env, request);

      default:
        return new Response("Not found", { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
