---
name: cocurdex-todo
description: Alias for /cocurdex-issue. Use when the user says todo, backlog item, or "remember this".
disable-model-invocation: true
argument-hint: "[list|create|inbox|slice|refine|start|move|done|wrap] …"
---

# /cocurdex-todo — Alias → `/cocurdex-issue`

**Not a separate system.** User language like “记个 todo / add a todo” maps to the same Linear-style **issues** on disk.

1. Open and follow **[../cocurdex-issue/SKILL.md](../cocurdex-issue/SKILL.md)** with the same args (including **CLI for structure**).
2. Prefer saying **issue** in paths and frontmatter; you may echo “todo” in chat if the user did.
3. Default intent when the user only pastes a one-liner: **`create`** via `cocurdex issue create` (not slice).
4. Implement with **`/cocurdex-ship`**, not here.

## Intent hints

| User says | Branch |
|-----------|--------|
| 记个 todo / add todo / remember | `create` |
| todos / what's open / frontier | `list` |
| start / pick up | `start` |
| dump bullets | `inbox` |

Full branch list and rules: **`/cocurdex-issue`**.
