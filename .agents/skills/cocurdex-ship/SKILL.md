---
name: cocurdex-ship
description: Implement a `.cocurdex` issue (or PRD/spec path), verify with project checks, update issue status, optional commit.
disable-model-invocation: true
---

# /cocurdex-ship — Implement an issue

## Preconditions

1. cocurdex-layout STORAGE + LAYOUT; issue storage is private unless it was explicitly published
2. Resolve issue: `cocurdex issue show <id> --json` (or PRD/spec path); load What to build + criteria + `blockedBy`
3. Stop if any blocker is not `done`
4. If the issue lacks shippable contract (What to build / acceptance criteria), stop and run **`/cocurdex-issue refine`** first

CLI invoke (private default):

```bash
cocurdex issue show <id> --json
# monorepo:
pnpm --filter @cocurdex/cli exec node --import tsx src/index.ts issue show <id> --json
```

## Process

### 1. Claim

If status is `backlog` → `cocurdex issue move <id> doing --json` (same as `/cocurdex-issue start`). Do not hand-edit `status`.

### 2. Plan

Restate criteria; note seams; use **tdd** for critical pure logic (AGENTS.md).

### 3. Implement

- Follow `AGENTS.md` (English code, biome/typecheck, no desktop dev server)
- i18n extract/types when adding `t("...")`

### 4. Verify

- Relevant tests; tick acceptance criteria on the issue body (Write)
- Large change → optional **code-review**

### 5. Status

- All criteria met → `cocurdex issue move <id> review --json` or `… move <id> done --json`
- Optional Write `## Completion`
- Summarise files, verify steps, issue path + status
- Commit only if user asks

## Completion criterion

Criteria satisfied as claimed; status updated via CLI; typecheck/biome clean for touched files.
