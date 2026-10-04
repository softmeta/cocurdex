---
name: cocurdex-ask
description: Router for Cocurdex product-knowledge skills (namespaced cocurdex-*). Use when unsure which /cocurdex-* skill to run for notes or issue work.
disable-model-invocation: true
---

# /cocurdex-ask — Which skill?

Notes and issues live in the app-owned Cocurdex database and are read and
written only through the `cocurdex` CLI, never as files in the workspace.

## Main flow

```text
/cocurdex-prd → /cocurdex-spec (optional) → /cocurdex-issue → /cocurdex-ship
```

| Need | Skill |
|------|-------|
| Product requirements | `/cocurdex-prd` (saved as a note) |
| Technical design | `/cocurdex-spec` (saved as a note) |
| Free-form or scratch note | `/cocurdex-note` |
| Create, list, or move issues | `/cocurdex-issue` |
| User says todo or ticket | `/cocurdex-todo`, `/cocurdex-ticket` (aliases of issue) |
| Link notes, inspect backlinks | `/cocurdex-link` |
| Implement an issue or spec | `/cocurdex-ship` |
| Split work across parallel agents | `/cocurdex-team` |
| View or change app settings | `/cocurdex-settings` |
| Where data lives, CLI access | `/cocurdex-layout` |

## Rules

- Use the `cocurdex` CLI for notes and issues; never open the database or write
  `.cocurdex/` files.
- Use ids returned by the CLI; never invent them.
- Prefer repository facts over asking the user.
