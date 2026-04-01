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
- For one-shot reminders: compute the absolute `nextRunIso` from the current datetime. For "in 2 hours", add 2 hours to now. For "tomorrow at 4pm", use the next day's date at 16:00.
- For a specific date each year (e.g., birthday), use a recurring cron with the day-of-month and month fields.
- Use `maxRuns` to limit how many times a recurring schedule fires. Omit for unlimited.
- Always show times in the user's local timezone without naming the timezone.
- Always list the schedule first before updating or deleting.
