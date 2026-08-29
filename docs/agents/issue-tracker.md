# Issue tracker

Issues and views are app-owned records in `cocurdex.sqlite`. The daemon is the
only database owner; skills and external tools must use `cocurdex issue ...`.
Do not inspect the SQLite schema or allocate ids manually.

```bash
cocurdex issue list [--status <id>] [--view <id>] [--json]
cocurdex issue show <id> [--view <id>] [--json]
cocurdex issue create --title <title> [--status <id>] [--priority <id>]
cocurdex issue move <id> <column> [--view <id>] [--json]
cocurdex issue delete <id> [--view <id>] [--json]
cocurdex issue views [--json]
```

Use the namespaced product skills: `/cocurdex-issue`,
`/cocurdex-ticket`, `/cocurdex-todo`, and `/cocurdex-ship`.
`todo` and `ticket` are language aliases for the same Issue model.

Repository Markdown is not updated implicitly. A future explicit export
command may publish selected records without becoming a second source of truth.
