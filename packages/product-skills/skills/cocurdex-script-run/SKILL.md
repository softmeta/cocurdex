---
name: cocurdex-script-run
description: Fan work out to many background subagents with a Cocurdex script run; use for the same task over many items (files, packages, issues) or a fixed multi-step pipeline with structured results.
---

# /cocurdex-script-run — Fan work out with a script

A script run is a short JavaScript program that starts subagents in the background. You propose it with `script_run_propose` (available only in a main session), the user reviews and approves it, and its return value comes back to you as a `[Script run "<name>" <status> with <n> agents]` message. The tool description is the reference for the script API; this skill covers when and how to use it.

## 1. Decide

Use a script run when the shape of the work is known before it starts:

- The same task over many items: review every changed file, audit each package, triage a list of issues.
- A fixed pipeline: plan, then edit in parallel, then verify, where every step is decided up front.
- You need structured results to merge: findings with file and line, scores, yes/no verdicts.

Prefer something else when:

- The work fits in your own turn, or one or two focused delegations do it: use your provider's native subagent tool.
- Workers need to talk to you or each other, share a task list, stay visible in the sidebar, or wait for the user: use `/cocurdex-team`.
- The next step depends on judging intermediate results. A script cannot ask you; propose one run per stage instead.

## 2. Write the script

- Gather inputs yourself first (file lists, package names, issue ids) and embed them as a literal array. The script cannot read files or run commands.
- Give every `agent()` call a self-contained prompt: the goal, the exact item, scope limits, and what to reply. Subagents do not see your conversation.
- Pass `label` so the user can tell agents apart in the run panel.
- Pass `schema` whenever you will merge the replies; the reply is validated and the agent retries a few times before resolving to `null`. Keep schemas small and flat.
- Pass `worktree: true` only for agents that edit files in parallel. Read-only agents never need it.
- Handle `null`: an agent that fails or is cancelled resolves to `null`. Filter or count those instead of letting them break the merge.
- `return` only what you need back, already reduced. The returned value is the whole report you receive.

Every `agent()` call counts toward the run's agent limit (5 by default; the user can raise it when approving). Exceeding it fails the whole run, so count your calls and say in your message how many agents the script starts.

Per-item review with a merged result:

```js
const files = ["src/auth.ts", "src/session.ts", "src/token.ts"];
const findings = await pipeline(files, (file) =>
  agent(
    `Review ${file} for security issues. Do not edit files. Report only concrete problems.`,
    {
      label: file,
      schema: {
        type: "object",
        properties: {
          issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                line: { type: "integer" },
                problem: { type: "string" },
              },
              required: ["line", "problem"],
            },
          },
        },
        required: ["issues"],
      },
    },
  ),
);
return files.map((file, i) => ({ file, issues: findings[i]?.issues ?? null }));
```

Plan, then edit in parallel, then verify:

```js
const plan = await agent("List the modules under packages/ that still import lodash. Reply with module paths only.", {
  label: "plan",
  schema: { type: "object", properties: { modules: { type: "array", items: { type: "string" } } }, required: ["modules"] },
});
if (!plan) return { error: "planning failed" };
const edits = await pipeline(plan.modules, (dir) =>
  agent(`Replace lodash with native code in ${dir}. Edit only files under ${dir}. Reply with a one-line summary.`, {
    label: dir,
    worktree: true,
  }),
);
return plan.modules.map((dir, i) => ({ dir, summary: edits[i] }));
```

## 3. Propose and wait

Call `script_run_propose` with a kebab-case `name` and the script. Then tell the user, in their language, what the script does, how many agents it starts, and whether any of them edit files in worktrees. End your turn. Do not poll; the run's report arrives as a new message, and the user can watch progress in the run panel.

## 4. Use the report

- `completed`: the body is your returned value as JSON. Merge it for the user, and name the items whose result was `null`.
- `failed`: the body is the error (a script exception, the agent limit, or the time limit). Fix the cause and propose a corrected run, or do the remaining work yourself.
- `cancelled` or `interrupted`: the user stopped it or the app restarted. Ask before proposing it again.

Agents with `worktree: true` work on `script/<name>-<id>` branches. List those branches for the user; do not merge them unless asked.

## Completion criterion

The merged result covers every item the script was given, and each missing or failed item is named with its reason.
