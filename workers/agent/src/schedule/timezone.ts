/**
 * Convert a cron expression from a local timezone to UTC.
 * Only converts the hour field; minute and day-of-week/month/day fields pass through.
 *
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */
export function cronLocalToUtc(cron: string, timezone: string): string {
  const offset = getUtcOffsetHours(timezone);
  return shiftCronHour(cron, -offset);
}

/**
 * Convert a cron expression from UTC to a local timezone.
 */
export function cronUtcToLocal(cron: string, timezone: string): string {
  const offset = getUtcOffsetHours(timezone);
  return shiftCronHour(cron, offset);
}

/**
 * Convert an ISO datetime from a local timezone to UTC.
 */
export function isoLocalToUtc(iso: string, timezone: string): string {
  // Parse the datetime as if it's in the local timezone
  // Create a date at the given local time, then compute the UTC equivalent
  const offset = getUtcOffsetHours(timezone);
  const d = new Date(iso);
  // If the ISO string has no timezone indicator, treat it as local
  if (!iso.endsWith("Z") && !iso.match(/[+-]\d{2}:\d{2}$/)) {
    d.setTime(d.getTime() - offset * 60 * 60 * 1000);
  }
  return d.toISOString();
}

/**
 * Format a cron expression as a human-readable local time string.
 * Returns something like "Daily at 7:30 AM" or "Weekdays at 9:00 AM".
 */
export function cronToLocalDescription(cron: string, timezone: string): string {
  const local = cronUtcToLocal(cron, timezone);
  const parts = local.split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dom, month, dow] = parts;

  const timeStr = formatTime(hour, minute);

  const dayStr = describeDays(dow, dom, month);

  return `${dayStr} at ${timeStr}`;
}

function formatTime(hour: string, minute: string): string {
  if (hour.includes(",") || hour.includes("/") || hour === "*") {
    return `${hour}:${minute.padStart(2, "0")}`;
  }
  const h = parseInt(hour);
  const m = parseInt(minute);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function describeDays(dow: string, dom: string, month: string): string {
  if (dom === "*" && month === "*") {
    if (dow === "*") return "Daily";
    if (dow === "1-5") return "Weekdays";
    if (dow === "0,6") return "Weekends";
    return `Days ${dow}`;
  }
  return "Scheduled";
}

function shiftCronHour(cron: string, hoursOffset: number): string {
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return cron;

  const [minute, hour, dom, month, dow] = parts;

  // Handle simple numeric hours and comma-separated lists
  if (/^[\d,]+$/.test(hour)) {
    const hours = hour.split(",").map((h) => {
      let shifted = (parseInt(h) + hoursOffset) % 24;
      if (shifted < 0) shifted += 24;
      return shifted;
    });
    return `${minute} ${hours.join(",")} ${dom} ${month} ${dow}`;
  }

  // For complex expressions (*/2, ranges), return as-is
  return cron;
}

function getUtcOffsetHours(timezone: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
    const localStr = now.toLocaleString("en-US", { timeZone: timezone });
    const utcDate = new Date(utcStr);
    const localDate = new Date(localStr);
    return (localDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}
