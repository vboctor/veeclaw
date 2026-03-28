import type { Env } from "./auth.ts";
import { googleFetch, googleJson } from "./google-fetch.ts";

const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

// ── Types ────────────────────────────────────────────────────��───────────────

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  htmlLink: string;
  status: string;
}

interface EventListResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
}

// ── Handlers ──────────────��────────────────���─────────────────────────────────

export async function handleCalendarList(env: Env, request: Request): Promise<Response> {
  const { timeMin, timeMax, calendarId = "primary", maxResults = 50 } =
    (await request.json()) as {
      timeMin: string;
      timeMax: string;
      calendarId?: string;
      maxResults?: number;
    };

  if (!timeMin || !timeMax) {
    return Response.json({ error: "timeMin and timeMax are required" }, { status: 400 });
  }

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const { data, error } = await googleJson<EventListResponse>(
    env,
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  );
  if (error) return error;

  return Response.json({ events: data?.items ?? [] });
}

export async function handleCalendarGet(env: Env, request: Request): Promise<Response> {
  const { eventId, calendarId = "primary" } = (await request.json()) as {
    eventId: string;
    calendarId?: string;
  };

  if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });

  const { data, error } = await googleJson<CalendarEvent>(
    env,
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleCalendarCreate(env: Env, request: Request): Promise<Response> {
  const { calendarId = "primary", summary, start, end, description, attendees, location } =
    (await request.json()) as {
      calendarId?: string;
      summary: string;
      start: string;
      end: string;
      description?: string;
      attendees?: string[];
      location?: string;
    };

  if (!summary || !start || !end) {
    return Response.json({ error: "summary, start, and end are required" }, { status: 400 });
  }

  const event: Record<string, unknown> = {
    summary,
    start: { dateTime: start },
    end: { dateTime: end },
  };
  if (description) event.description = description;
  if (location) event.location = location;
  if (attendees) event.attendees = attendees.map((email) => ({ email }));

  const { data, error } = await googleJson<CalendarEvent>(
    env,
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleCalendarUpdate(env: Env, request: Request): Promise<Response> {
  const { eventId, calendarId = "primary", updates } = (await request.json()) as {
    eventId: string;
    calendarId?: string;
    updates: Record<string, unknown>;
  };

  if (!eventId || !updates) {
    return Response.json({ error: "eventId and updates are required" }, { status: 400 });
  }

  // Normalize attendees if provided as string array
  if (Array.isArray(updates.attendees) && typeof updates.attendees[0] === "string") {
    updates.attendees = (updates.attendees as string[]).map((email) => ({ email }));
  }

  const { data, error } = await googleJson<CalendarEvent>(
    env,
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    },
  );
  if (error) return error;

  return Response.json(data);
}

export async function handleCalendarDelete(env: Env, request: Request): Promise<Response> {
  const { eventId, calendarId = "primary" } = (await request.json()) as {
    eventId: string;
    calendarId?: string;
  };

  if (!eventId) return Response.json({ error: "eventId is required" }, { status: 400 });

  const res = await googleFetch(
    env,
    `${CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text, status: res.status }, { status: res.status });
  }

  return Response.json({ deleted: true, eventId });
}
