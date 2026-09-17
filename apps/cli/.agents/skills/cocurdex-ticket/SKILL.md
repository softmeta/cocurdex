---
name: cocurdex-ticket
description: Alias for /cocurdex-issue. Use when the user says ticket or work item.
disable-model-invocation: true
argument-hint: "[list|create|inbox|slice|refine|start|move|done|wrap] …"
---

# /cocurdex-ticket — Alias → `/cocurdex-issue`

**Not a separate system.** “Ticket” is everyday language for the same app-owned Issues.

1. Open and follow **[../cocurdex-issue/SKILL.md](../cocurdex-issue/SKILL.md)** with the same args (including **CLI for structure**).
2. Prefer saying **issue** in paths and frontmatter; you may echo “ticket” in chat if the user did.
3. Default intent when the user wants breakdown from a PRD/spec or multi-slice work: **`slice`**. Single one-liner → **`create`** via CLI.
4. Implement with **`/cocurdex-ship`**, not here.

## Intent hints

| User says | Branch |
|-----------|--------|
| file a ticket / one card | `create` |
| break down / slice from PRD | `slice` |
| tickets on the board | `list` |
| pick up ticket N | `start` |

Full branch list and rules: **`/cocurdex-issue`**.
