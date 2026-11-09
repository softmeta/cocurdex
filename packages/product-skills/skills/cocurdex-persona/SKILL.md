---
name: cocurdex-persona
description: Create, configure, and talk to Cocurdex personal agents (personas in the assistant form) through the CLI, and hand coding work from them to work sessions. Use when the user mentions their assistant, a persona, a personal agent, or wants to hand a message or a task to one.
---

# /cocurdex-persona — Personal agents

The assistant form holds the user's personal agents. Each persona is an agent role (name, model, instructions, avatar) on the Pi engine plus a soul (standing personality and preferences) and one home thread, a long-lived session in the personal workspace. One persona is the default, listed first; the first persona created becomes the default. Deleting the default hands that role to the next persona in the list; when none is left, there is no persona until the user or an agent creates one. A home thread cannot be deleted or archived on its own, only with its persona.

Manage personas through the `cocurdex` CLI. A `<persona>` argument accepts the persona id, a unique id prefix, or its name (case-insensitive).

```bash
cocurdex persona list --json
cocurdex persona show <persona> --json
cocurdex persona create --name <name> [--provider <id> --model <id>] \
  [--description <text>] [--instructions <text>|--instructions-file <path>] \
  [--soul <text>|--soul-file <path>] --json
cocurdex persona update <persona> [--name <name>] [--provider <id> --model <id>] \
  [--description <text>] [--instructions <text>|--instructions-file <path>] \
  [--soul <text>|--soul-file <path>] [--pin|--unpin] [--mute|--unmute] --json
cocurdex persona duplicate <persona> --name <name> --json
cocurdex persona delete <persona> --json
cocurdex persona send <persona> <message> [--wait] [--timeout <seconds>] --json
cocurdex persona thread <persona> [--limit <n>] --json
```

- Personas always run on Pi; pick a model the user has configured (`cocurdex provider list`).
- A muted persona (`--mute`) never notifies the desktop or the phone; what needs the user from its threads still shows in the assistant overview and `cocurdex inbox`.
- `send` posts to the persona's home thread and returns the message id. With `--wait` it returns the reply once the turn settles, and fails with the persona's error when the turn fails. Without `--wait`, read the reply later with `thread`.
- Instructions describe the job; the soul describes who the persona is to the user. Keep both short and specific, and pass long text with the `-file` flags.
- Deleting a persona also deletes its role and home thread. Confirm with the user first.
- `list` and `show` read back what you changed; verify after every write.

## Memory

Long-term memory is the user's own library, shared by every persona. It is split into partitions: `me` holds what the user said about themselves, and `agent:<persona-id>` holds what one persona learned while working. Read and maintain it through the CLI; agents in a turn also have the `memory` tool group.

```bash
cocurdex memory list [--partition me|agent:<persona-id>] [--since <date>] [--limit <n>] --json
cocurdex memory show <id> --json
cocurdex memory update <id> [--title <title>] [--content <text>|--file <path>] [--tags a,b] [--importance important|trivial] --json
cocurdex memory forget <id> --json
cocurdex memory restore <full-id> --json
cocurdex memory history [<id>] [--limit <n>] --json
cocurdex memory export <file> --json
cocurdex memory import <file> --json
```

- Inside a persona's thread, each turn recalls that persona's partition plus `me`, never another persona's. `memory_remember` writes to the persona's partition; pass `about: "user"` for a fact every persona should share. The instructions and soul are part of the persona's system prompt on every turn, so an edit applies from the next message.
- `forget` is reversible: `history` lists the deleted entry with its full id, and `restore` takes that full id.
- Edit an entry in place with `update` instead of storing a near-duplicate; read it back with `show`.
- `list` reports `error` when memory is off or not installed; relay the fix it names (see `/cocurdex-settings`) instead of retrying.
- Export writes the whole library as plaintext JSON. Only export or import when the user asks, and tell them where the file is.

## Routines

A routine runs a persona on a schedule: an interval (`--every <minutes>`, at least 5) or a wall-clock time (`--at HH:MM`, optionally `--days mon,wed|weekdays|weekends`) in an IANA time zone (`--tz`, default the host's). Every run starts a fresh thread under the persona, with the persona's instructions, soul, and memory; the previous run's thread is archived. A `<routine>` argument accepts the id, a unique id prefix, or its name.

```bash
cocurdex routine list [--persona <persona>] --json
cocurdex routine show <routine> --json
cocurdex routine create --persona <persona> --name <name> --prompt <text>|--prompt-file <path> \
  (--every <minutes>|--at <HH:MM> [--days <days>]) [--tz <zone>] \
  [--access read-and-draft|full] [--deliver inbox|push|silent] --json
cocurdex routine update <routine> [--name <name>] [--prompt <text>|--prompt-file <path>] \
  [--every <minutes>|--at <HH:MM> [--days <days>]] [--tz <zone>] [--access ...] [--deliver ...] --json
cocurdex routine pause|resume <routine> --json
cocurdex routine run <routine> [--wait] [--timeout <seconds>] --json
cocurdex routine runs [<routine>] [--limit <n>] --json
cocurdex routine delete <routine> --json
```

- Write the prompt as a self-contained instruction; every run starts from it alone.
- Runs are unattended: nobody can answer a question mid-run. `access`: `read-and-draft` (default) limits the run to reading files and memory plus the routine tools, and blocks every other tool; `full` allows every tool. Grant `full` only when the user asks for it explicitly.
- Each run ends by calling `routine_report` with a `status`: `ready` (a result to read), `dropped` (nothing worth telling; recorded, never delivered), `needs_you` (with a `question` the user must answer), `blocked`, or `failed` (counts as a failure). A run that forgets is reminded once; if it still does not report, its final reply is used as a `ready` result. `routine runs` shows each run's `outcome`, `summary`, and `question`.
- `deliver`: `inbox` (default) records results quietly and notifies on failure; `push` also notifies the phone on every result; `silent` only records. Unless the routine is `silent`, each delivered result is also posted into the persona's home thread, marked with the routine as its source, and the persona sees it on its next turn there. `needs_you` and `blocked` runs are posted and reach the inbox even when `silent`.
- A run is stopped and failed after 20 minutes. A run cut off by a daemon restart is recorded as failed and is not replayed; the routine waits for its next slot. A run that was missed while the machine slept runs once on wake. Failures back off, three in a row pause the routine (`paused: failures`), and `resume` clears it. Each routine runs at most 24 times a day; extra runs are recorded as `skipped`.
- Inside a persona's thread, the `routine` tool group (`routine_list`, `routine_create`, `routine_update`, `routine_run`, `routine_runs`, `routine_delete`) manages that persona's own routines; `routine_report` exists only inside a running routine. Tools cannot grant `full` access or change or run a `full` routine.
- Deleting a routine deletes its run threads; deleting a persona deletes its routines and their threads.

## Delegated work

A persona does not write code itself. It hands repository work to an ordinary work session in one of the user's workspaces, which runs on the user's coding agents and shows up in the work sidebar, where the user can follow and take it over. A `<session-id>` is the `sessionId` that `start` and `list` return.

```bash
cocurdex persona work catalog --json
cocurdex persona work list <persona> --json
cocurdex persona work start <persona> --workspace <id|name> --prompt <text>|--prompt-file <path> \
  [--title <title>] [--role <role>|--team <template>] [--worktree] --json
cocurdex persona work send <persona> <session-id> <message> --json
cocurdex persona work stop <persona> <session-id> --json
```

- `catalog` lists the workspaces (never the chat or personal ones), saved agent roles, and team templates that `start` accepts by id or exact name.
- Without `--role` or `--team`, the session uses the workspace's most recent agent and model. `--role` runs it as that agent role; `--team` makes it lead that team template, with the template's first member as its role. Pass one or the other, not both. `--worktree` works in a new git worktree.
- The task arrives in the session marked as coming from the persona. Each time the session finishes a turn, its reply is posted into the persona's home thread, and the persona takes a new turn to tell the user what happened.
- The session runs with the workspace's usual permission mode; approvals and questions reach the user through the assistant overview and notifications, never the persona.
- `send` delivers a follow-up into the session's current turn when its agent supports it, otherwise after it. A persona can only see, message, and stop the sessions it delegated.
- Inside a persona's thread, the `work` tool group (`work_catalog`, `work_start`, `work_list`, `work_send`, `work_stop`) does the same. A routine can delegate only with `full` access.

## Inbox and brief

The inbox gathers what needs the user from personas: pending approvals, questions, and plans, failed or unread finished sessions, from persona threads and the work sessions personas delegated (never ordinary work or chat sessions), and routine results, runs that need the user, failures, and auto-pauses. Items are ordered by what needs the user, then failures, then results. The brief is today's summary built from the same data without a model: what needs the user, each routine's latest result today, and failures; it is `null` when there is nothing to report.

```bash
cocurdex inbox [list] --json
cocurdex inbox read <item-id> --json
cocurdex inbox brief [--tz <zone>] --json
cocurdex inbox brief post [--tz <zone>] [--locale en-US|zh-CN] --json
```

- `read` marks the item's thread visited, which clears it; do it only after the user has seen or handled the item.
- Use the brief to answer "what happened today" or "what needs me" instead of reading every thread.
- `brief post` writes today's brief into the default assistant's home thread, in the given locale (the last one used otherwise), and returns the message; it returns `null` when there is no brief or nothing changed since the last post. The apps post it when the user comes back after being away.
