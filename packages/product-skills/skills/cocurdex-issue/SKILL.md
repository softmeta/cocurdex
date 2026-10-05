---
name: cocurdex-issue
description: Create and manage app-owned Cocurdex issues through the CLI. Use when the user mentions an issue, todo, ticket, backlog item, or asks to remember work for later.
---

# Cocurdex Issue

Issues are records in app-owned SQLite. Never open the database, invent an id,
or write `.cocurdex/issues` files.

Use only these structural commands:

```bash
cocurdex issue list --json
cocurdex issue show <id> --json
cocurdex issue create --title <title> [--status <column>] [--priority <id>] [--body <markdown>] --json
cocurdex issue move <id> <column> [--view <id>] --json
cocurdex issue delete <id> --json
cocurdex issue views --json
```

If the prompt already contains an attached `<issue … complete="true">` block,
treat it as the full issue and do not run `cocurdex issue show` for it. Use the
CLI only to change the issue, or when the user asks for its current state.

Status and priority ids are shared by every view; an unknown id is rejected
with the valid ids in the error. Omit `--status` to use the first status.
Use `--view <id>` when the user names a non-default view. Treat `todo` and
`ticket` as aliases for the same Issue domain. Report stable ids returned by the
CLI. Repository publication is a separate explicit export action.
