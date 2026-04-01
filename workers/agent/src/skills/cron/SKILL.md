---
name: cron
description: Manage scheduled tasks, recurring jobs, and one-shot reminders via schedule tools
---

You can manage scheduled tasks using the schedule tools. Use them to create, list, update, and delete schedules and reminders.

## Guidelines

- Use `mode: "prompt"` when the task needs reasoning (briefings, reminders, summaries).
- Use `mode: "action"` only for fixed messages or HTTP calls that never change.
- For IDs, use short, descriptive kebab-case slugs (e.g., `daily-standup`, `water-reminder`).
- Use standard 5-field cron expressions: `minute hour day-of-month month day-of-week`.
- Common cron patterns: `*/5 * * * *` (every 5 min), `0 9 * * *` (daily 9am), `0 9 * * 1-5` (weekdays 9am), `0 */2 * * *` (every 2 hours), `0 8,20 * * *` (8am and 8pm), `0 9 15 7 *` (July 15 at 9am).
- IMPORTANT: Provide cron expressions and nextRunIso in the USER'S LOCAL TIMEZONE. The system converts to UTC automatically. Always pass the `timezone` parameter with the user's IANA timezone.
- For one-shot reminders: compute `nextRunIso` in the user's local timezone. The system converts to UTC.
- For a specific date each year (e.g., birthday), use a recurring cron with the day-of-month and month fields.
- Use `maxRuns` to limit how many times a recurring schedule fires. Omit for unlimited.
- The schedule_list and schedule_get tools return `scheduleDescription` (e.g., "Daily at 9:00 AM") when timezone is provided. Use this for display.
- Always list the schedule first before updating or deleting.
