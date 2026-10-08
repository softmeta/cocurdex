---
name: cocurdex-issue
description: Create and manage app-owned Cocurdex issues through the CLI. Use when the user mentions an issue, todo, ticket, backlog item, or asks to remember work for later.
---

# Cocurdex Issue

Issues are records in app-owned SQLite. Never open the database, invent an id,
or write `.cocurdex/issues` files.

Use only these structural commands:

```bash
cocurdex issue list [--status <column>] [--label <name>] [--parent <id>] [--open] --json
cocurdex issue show <id> [--detail] --json
cocurdex issue create --title <title> [--status <column>] [--priority <id>] [--body <markdown>] [--parent <id>] [--labels <a,b>] --json
cocurdex issue update <id> [--title <title>] [--body <markdown>] [--status <column>] [--priority <id>] [--parent <id>|none] [--labels <a,b>] --json
cocurdex issue move <id> <column> [--view <id>] --json
cocurdex issue comment <id> --body <markdown> --json
cocurdex issue relate|unrelate <id> blocks|related|duplicate <other-id> --json
cocurdex issue labels --json
cocurdex issue label create --name <name> [--color <color>] --json
cocurdex issue delete <id> --json
cocurdex issue views --json
```

Every `<id>` accepts the issue's stable id or its short identifier such as
`COC-12`. Prefer the identifier when you mention an issue to the user.
`--labels` replaces the issue's label set and accepts label ids or names;
create a missing label first. `--parent none` detaches a sub-issue.
`show --detail` adds the parent, sub-issues, relations, linked sessions, and
the activity log.

If the prompt already contains an attached `<issue … complete="true">` block,
treat it as the full issue and do not run `cocurdex issue show` for it. Use the
CLI only to change the issue, or when the user asks for its current state.

When you implement an issue, move it to the in-progress column (`doing` by
default) before you start, and to `review` once its acceptance criteria are met
and the relevant checks pass (`done` when the user does not review). Record
what you verified with `cocurdex issue comment`. Split large work into
sub-issues with `--parent`, and record ordering constraints with
`issue relate <id> blocks <other-id>`. Stop and ask when the issue has no clear
scope or acceptance criteria.

Each status column has a category (`backlog`, `unstarted`, `started`,
`completed`, `canceled`); `show` reports it as `statusCategory`, and
`list --open` hides completed and canceled issues.

Status and priority ids are shared by every view; an unknown id is rejected
with the valid ids in the error. Omit `--status` to use the first status.
Use `--view <id>` when the user names a non-default view. Treat `todo` and
`ticket` as aliases for the same Issue domain. Report stable ids returned by the
CLI. Repository publication is a separate explicit export action.
