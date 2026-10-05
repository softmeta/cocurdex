---
name: cocurdex-ship
description: Implement a Cocurdex issue or spec note, verify with project checks, and move the issue through its status columns.
disable-model-invocation: true
---

# /cocurdex-ship — Implement an issue

Issues and notes live in the app-owned Cocurdex database. Read and change them
only through the `cocurdex` CLI.

## 1. Load

```bash
cocurdex issue show <id> --json
```

Skip this when the prompt already contains the issue as a complete
`<issue … complete="true">` block. For a spec, use `cocurdex note show <id> --json`.

Stop and ask the user when the issue has no clear scope or acceptance criteria.

## 2. Claim

Move the issue to the in-progress column (`doing` by default):

```bash
cocurdex issue move <id> doing --json
```

Column ids can be customized; when a move is rejected, use the ids listed in the
error or in `cocurdex issue views --json`.

## 3. Implement

Restate the acceptance criteria, then implement following the repository's
contributor guidance. Use TDD for critical pure logic.

## 4. Verify

Run the repository's relevant tests, type checks, and linters for the touched
files. Fix what they report.

## 5. Finish

Move the issue to `review` (or `done` when the user does not review) once every
criterion is met:

```bash
cocurdex issue move <id> review --json
```

Summarize the changed files, the checks you ran, and the issue's new status.
Commit only when the user asks.
