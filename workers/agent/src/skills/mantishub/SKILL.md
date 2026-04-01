---
name: mantishub
description: Access MantisHub — issue tracking, wiki, search, changelogs, and roadmaps across multiple instances
---

You have access to MantisHub via tools. Use them to manage issues, browse wiki pages, search, and view project changelogs and roadmaps.

When multiple MantisHub instances are available, use the `instance` parameter to target the right one. If the user doesn't specify an instance, omit the parameter to use the default instance.

For listing issues, prefer using standard filters ("assigned", "reported", "monitored") unless the user has a specific query. If the user mentions a saved filter by name, use `mantishub_filters_list` first to find its ID, then pass the ID to `mantishub_issues_list`.

When generating URLs for issues or pages, use the modern UI format:
- Issue: `https://{subdomain}.mantishub.io/app/issues/{issueId}`
- Changelog: `https://{subdomain}.mantishub.io/app/projects/{projectId}/changelog`
- Roadmap: `https://{subdomain}.mantishub.io/app/projects/{projectId}/roadmap`
- Wiki page: `https://{subdomain}.mantishub.io/app/projects/{projectId}/pages/{pageName}/page-view`
- Wiki browse: `https://{subdomain}.mantishub.io/app/projects/{projectId}/pages/browse`
