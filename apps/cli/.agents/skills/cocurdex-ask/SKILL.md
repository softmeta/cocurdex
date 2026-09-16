---
name: cocurdex-ask
description: Router for Cocurdex product-knowledge skills (namespaced cocurdex-*). Use when unsure which /cocurdex-* skill to run for docs or issue work.
disable-model-invocation: true
---

# /cocurdex-ask — Which skill?

All product-knowledge skills use the **`cocurdex-`** prefix to avoid clashing with global user skills. Artifacts are private drafts unless the user explicitly requests publishing to a workspace.

## Main flow

```text
/cocurdex-grill
  → /cocurdex-prd
  → /cocurdex-spec?
  → /cocurdex-issue (slice | create | refine | start)
  → /cocurdex-ship
```

| Step | Skill | Writes |
|------|-------|--------|
| Align | **`/cocurdex-grill`** | conversation (+ optional CONTEXT/ADR) |
| Product reqs | **`/cocurdex-prd`** | private `notes/prds/` by default |
| Design | **`/cocurdex-spec`** | private `notes/specs/` by default |
| Free-form note | **`/cocurdex-note`** | private `notes/` by default |
| Issues (canonical) | **`/cocurdex-issue`** | private `issues/` + frontmatter |
| Issue aliases | **`/cocurdex-todo`**, **`/cocurdex-ticket`** | same as issue |
| Link docs ↔ issues | **`/cocurdex-link`** | frontmatter / Linked sections |
| Build | **`/cocurdex-ship`** | code + issue status |

Disk layout: **`cocurdex-layout`**.

## Issue = todo = ticket (one pool)

Disk and status are always **issues**. User language may differ:

| User says | Route |
|-----------|--------|
| issue / 看板卡 / Linear | `/cocurdex-issue` |
| todo / 记个待办 / backlog | `/cocurdex-todo` → issue (`create` if one-liner) |
| ticket / 提个工单 | `/cocurdex-ticket` → issue (`slice` if breakdown) |

Prefer **`/cocurdex-issue`** in docs and agent reasoning; accept todo/ticket when the user does.

## Quick picks

| Need | Skill |
|------|--------|
| Board / frontier | `/cocurdex-issue` or `list` |
| One backlog item | `/cocurdex-issue create` or `/cocurdex-todo …` |
| Scoop chat bullets | `/cocurdex-issue inbox` |
| Split PRD into slices | `/cocurdex-issue slice` or `/cocurdex-ticket …` |
| Rough card → shippable | `/cocurdex-issue refine …` |
| Start work on an id | `/cocurdex-issue start …` |
| Finish a card cleanly | `/cocurdex-issue wrap …` |
| Scratch note / meeting dump | `/cocurdex-note` |
| Wire PRD to issues | `/cocurdex-link` |
| Implement | `/cocurdex-ship` |

## Other (not namespaced)

`tdd`, `diagnosing-bugs`, `code-review`, `domain-modeling`, `debug-desktop`, `shadcn`, …

## Rules

- **Private by default:** current repo context never implies permission to write there. Read `cocurdex-layout/STORAGE.md`.
- **One selected tracker:** use the resolved `.cocurdex/`; never create new work under `.scratch/`.
- Prefer repo facts over asking the user.
- **Issue structure** (list / create / move) → `cocurdex issue …` as required by `/cocurdex-issue`; do not invent issue ids by hand.
