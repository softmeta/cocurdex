---
name: cocurdex-team
description: Split independent work across parallel teammate agents using Cocurdex team tools; decide when a team helps, brief teammates, and merge their reports.
---

# /cocurdex-team — Run work as an agent team

You are the lead. Teammates are separate agent sessions that run in parallel, share one task list with you, and deliver their final reply of each turn back to you as `[Teammate "<name>" finished]` or `[Teammate "<name>" failed]`. A teammate that stops on an approval or question also sends `[Teammate "<name>" is waiting for the user]`, at most once per turn.

Tools (available only in a main session): `team_spawn_teammate`, `team_spawn_template`, `team_list_roles`, `team_list_templates`, `team_task_create`, `team_task_list`, `team_task_update`, `team_stop_member`, `team_stop`, `messaging_list_agents`, `messaging_send_message`.

## 1. Decide

Use a team only when the work splits into pieces that are independent of each other and whose results you can merge yourself. Good fits: multi-angle review (security, performance, tests), per-module batch edits, the same prompt across providers, research split by source.

Do not use a team when:

- The work is a strict chain (design, then implement, then test) with nothing to run in parallel. Do the steps yourself.
- Only the result matters and your own provider can do it: use your native subagent tool (for example Claude's Agent tool) instead; it is cheaper than a teammate.
- A human must approve mid-way. Teammates do not pause for approval.
- The work is small enough to finish in one turn yourself.

Teammates cannot spawn their own teammates. A team holds at most 8 members.

## 2. Plan the split

1. Write the pieces first: one `team_task_create` per piece, with a title and a description that names the files or scope. Keep pieces disjoint. When a piece needs another finished first, pass `blockedBy` with the prerequisite task ids; a blocked task cannot be claimed until every prerequisite is `done`.
2. Decide the file-write policy before spawning:
   - Teammates that edit files in the same workspace must not touch overlapping files. If overlap is unavoidable, spawn with `isolateWorktree: true`; each such teammate then works on its own branch and you merge afterwards.
   - Read-only teammates (review, research) never need isolation.
3. If a saved template matches (`team_list_templates`), prefer `team_spawn_template` with the task as `prompt`. Otherwise pick roles with `team_list_roles` when a saved role fits.

## 3. Spawn

One `team_spawn_teammate` per piece. Names are lowercase slugs (`security-review`, `module-auth`) used to address the teammate. Also pass a short `title` in the user's language (`安全审查`, `Auth module`); the app shows it to the user and falls back to the name.

The prompt must contain everything the teammate needs; it does not see your conversation:

- The goal and the exact task ids it owns (from step 2). Tell it to claim each with `team_task_update({ taskId, status: "doing", assignee: "me" })` and, when finished, move it to `review` with `evidence` (commands run and their results). A teammate cannot mark its own task `done`.
- Scope limits: which files or directories it may edit, and that it must not edit others.
- What the final reply must contain: the format you will merge (a list of findings with file:line, a summary of changes, a JSON block). Say the reply is delivered to you automatically.
- Whether to ask you questions through `messaging_send_message` or to decide alone.

After spawning, end your turn. Do not poll `team_task_list` in a loop; reports arrive as new messages.

## 4. Merge

Each report arrives as a separate message and may arrive in any order.

- On `finished`: record the outcome, check `team_task_list` for tasks still in `backlog` or `doing`, and reassign or take them yourself if a teammate stopped early.
- On `failed`: read the error, decide whether to respawn with a corrected prompt or do the piece yourself.
- On `is waiting for the user`: only the user can answer it. Tell the user which teammate is waiting and on what, then end your turn; do not resend its work or force-stop it to get unstuck.
- Check each task in `review` against its evidence and move it to `done` with `team_task_update`, or send the teammate what is missing.
- When every task is `review` or `done`, write the merged result for the user and state which teammates contributed what.
- If teammates used isolated worktrees, list the branches for the user to merge; do not merge branches yourself unless asked.

Once every report is merged, call `team_stop`. Use `team_stop_member` earlier for a single teammate that is done. Stopping or archiving your own session also stops every teammate.

`team_stop` and `team_stop_member` fail with `members_busy` while a teammate is running or holds unread messages. Do not answer that by forcing: end your turn and let the reports wake you. Pass `force: true` only for a teammate that is off track; forcing interrupts it and discards its unread messages.

A `messaging_send_message` to a running teammate is injected into its current turn (`steer-active-run`) or, when its agent cannot be steered, queued until that turn ends (`queue-after-run`). Reports to you follow the same rule, so a lead whose agent cannot be steered sees them only after ending its turn.

## Completion criterion

Every task on the shared list is `review` or `done`, or explicitly handed back to the user with a reason; the merged result names its sources.
