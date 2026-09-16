---
name: cocurdex-grill
description: Relentless interview to sharpen a plan before writing Cocurdex PRDs/specs/issues. Optionally updates CONTEXT.md / ADRs.
disable-model-invocation: true
---

# /cocurdex-grill — Align before you build

Interview until the plan is sharp enough for `/cocurdex-prd`, `/cocurdex-spec`, or `/cocurdex-issue`. **Do not implement** until the user confirms shared understanding.

## Process

### 1. Context

- With a codebase: skim `CONTEXT.md`, ADRs, linked `.cocurdex` notes. Look up **facts**; put **decisions** to the user.

### 2. Interview loop

- **One question at a time**; wait for each answer.
- Walk each design branch; resolve decision dependencies in order.
- Every question includes **your recommended answer** (1–2 sentences).
- Prefer concrete scenarios; challenge fuzzy language; use glossary terms.

### 3. Domain capture (codebase present)

- Glossary terms → `CONTEXT.md` (no implementation dump)
- Hard-to-reverse trade-offs → offer ADR under `docs/adr/`

### 4. Close

Summarise decisions, risks, next skill: `/cocurdex-prd` → `/cocurdex-spec?` → `/cocurdex-issue` → `/cocurdex-ship`. Wait for confirmation before writing files.

## Completion criterion

User confirmed alignment; decision summary in chat; domain docs updated if needed.
