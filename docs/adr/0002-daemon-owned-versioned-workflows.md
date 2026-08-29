# ADR 0002: Daemon-owned versioned workflows

## Status

Accepted (2026-08-09)

## Context

Cocurdex needs to coordinate provider-neutral plan, implementation, validation,
review, and approval stages without coupling workflow lifecycle to any agent.
A hard-coded Codex/Grok sequence would be difficult to extend, while a general
user-authored DAG or scripting runtime would add unproven complexity before the
recovery semantics are reliable.

## Decision

1. The daemon owns Workflow Run scheduling, persistence, permissions, retries,
   terminal status, and user gates.
2. A Workflow Run freezes both a versioned Workflow Definition Revision and its
   Executor Bindings when it is created.
3. The first product workflow is the fixed `plan_execute_review` definition,
   while its planner, implementer, and reviewer bindings remain configurable.
4. Agent adapters execute individual Agent Attempts and do not select the next
   workflow step.
5. Step Runs exchange immutable, schema-versioned Workflow Artifacts rather
   than transcripts.
6. SQLite projections and a transactional outbox are the durable execution
   authority. Provider-local workflows may run inside one Agent Attempt but do
   not own the outer Workflow Run.
7. A worker claims outbox actions with leases, checkpoints Attempt Runtime
   Identity before relying on provider-side continuation, and settles workflow
   state plus the claimed action in one SQLite transaction.
8. Human and provider waits are durable Workflow Suspensions. UI state and
   in-memory pause messages are projections, not continuation authority.
9. Agent-backed steps receive provider-neutral prompts assembled from the
   frozen objective and typed input artifacts. Their final output must satisfy
   the step's JSON artifact contract before the state machine can advance.
10. The initial validation step is a separate, restricted Agent Attempt using
    the implementer binding. This lets each repository select relevant checks
    without embedding project-specific shell commands in the workflow engine.

## Consequences

- Replacing Claude with Codex or Grok Build with OpenCode changes bindings, not
  the workflow definition or persistence model.
- Existing runs remain reproducible after definitions and defaults change.
- The initial state machine stays intentionally small while retaining a path to
  parallel branches and additional definitions.
- Crash recovery requires idempotent actions and reconciliation of ambiguous
  provider writes; transcript replay is not considered workflow recovery.
- An expired worker lease resumes the existing running Agent Attempt when its
  runtime identity is available; it does not silently create a second attempt.
- Workflow subagent sessions use the existing adapter runtime and provider
  continuation mechanisms, while a daemon scheduler can execute independent
  Workflow Runs concurrently.
