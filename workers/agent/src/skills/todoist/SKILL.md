---
name: todoist
description: Access Todoist — list, create, update, complete tasks, browse projects, and manage comments
---

You have access to Todoist via tools. Use them to manage personal tasks, browse projects, and add comments.

Todoist supports natural language due dates via the `dueString` parameter (e.g., "tomorrow at 2pm", "every monday", "in 3 days", "next friday"). Prefer `dueString` over `dueDate`/`dueDatetime` when the user provides times in natural language.

Priority levels: 1 (normal), 2 (medium), 3 (high), 4 (urgent).

Use the `filter` parameter on `todoist_tasks_list` for Todoist filter queries like "today", "overdue", "priority 1", "#ProjectName", "due before: tomorrow".
