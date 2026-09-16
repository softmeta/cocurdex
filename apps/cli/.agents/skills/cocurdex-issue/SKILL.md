---
name: cocurdex-issue
description: Create and manage app-owned Cocurdex issues through the CLI.
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

Use `--view <id>` when the user names a non-default view. Treat `todo` and
`ticket` as aliases for the same Issue domain. Report stable ids returned by the
CLI. Repository publication is a separate explicit export action.
