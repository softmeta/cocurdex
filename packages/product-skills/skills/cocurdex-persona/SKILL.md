---
name: cocurdex-persona
description: Create, configure, and talk to Cocurdex personal agents (personas in the assistant form) through the CLI. Use when the user mentions their assistant, a persona, a personal agent, or wants to hand a message to one.
---

# /cocurdex-persona — Personal agents

The assistant form holds the user's personal agents. Each persona is an agent role (name, engine, model, instructions, avatar) plus a soul (standing personality and preferences) and one home thread, a long-lived session in the personal workspace. The default persona always exists and cannot be deleted; its home thread cannot be deleted or archived on its own.

Manage personas through the `cocurdex` CLI. A `<persona>` argument accepts the persona id, a unique id prefix, or its name (case-insensitive).

```bash
cocurdex persona list --json
cocurdex persona show <persona> --json
cocurdex persona create --name <name> [--agent <agent>] [--provider <id> --model <id>] \
  [--description <text>] [--instructions <text>|--instructions-file <path>] \
  [--soul <text>|--soul-file <path>] --json
cocurdex persona update <persona> [--name <name>] [--agent <agent>] [--provider <id> --model <id>] \
  [--description <text>] [--instructions <text>|--instructions-file <path>] \
  [--soul <text>|--soul-file <path>] [--pin|--unpin] [--mute|--unmute] --json
cocurdex persona duplicate <persona> --name <name> --json
cocurdex persona delete <persona> --json
cocurdex persona send <persona> <message> [--wait] [--timeout <seconds>] --json
cocurdex persona thread <persona> [--limit <n>] --json
```

- `create` defaults the engine to Pi; pick `--agent` and a model the user has configured (`cocurdex provider list`).
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

- Inside a persona's thread, each turn recalls that persona's partition plus `me`, never another persona's. `memory_remember` writes to the persona's partition; pass `about: "user"` for a fact every persona should share. The soul is sent at the start of each new thread, so a soul edit applies from the next thread.
- `forget` is reversible: `history` lists the deleted entry with its full id, and `restore` takes that full id.
- Edit an entry in place with `update` instead of storing a near-duplicate; read it back with `show`.
- `list` reports `error` when memory is off or not installed; relay the fix it names (see `/cocurdex-settings`) instead of retrying.
- Export writes the whole library as plaintext JSON. Only export or import when the user asks, and tell them where the file is.

## Routines

A routine runs a persona on a schedule: an interval (`--every <minutes>`, at least 5) or a wall-clock time (`--at HH:MM`, optionally `--days mon,wed|weekdays|weekends`) in an IANA time zone (`--tz`, default the host's). Each routine has its own thread under the persona, with the persona's soul and memory. A `<routine>` argument accepts the id, a unique id prefix, or its name.

```bash
cocurdex routine list [--persona <persona>] --json
cocurdex routine show <routine> --json
cocurdex routine create --persona <persona> --name <name> --prompt <text>|--prompt-file <path> \
  (--every <minutes>|--at <HH:MM> [--days <days>]) [--tz <zone>] \
  [--access read-and-draft|ask|full] [--deliver inbox|push|silent] --json
cocurdex routine update <routine> [--name <name>] [--prompt <text>|--prompt-file <path>] \
  [--every <minutes>|--at <HH:MM> [--days <days>]] [--tz <zone>] [--access ...] [--deliver ...] --json
cocurdex routine pause|resume <routine> --json
cocurdex routine run <routine> [--wait] [--timeout <seconds>] --json
cocurdex routine runs [<routine>] [--limit <n>] --json
cocurdex routine delete <routine> --json
```

- Write the prompt as a self-contained instruction; every run starts from it alone.
- `access`: `read-and-draft` (default) keeps the agent on its most restricted permission mode; `ask` uses the persona's own mode and waits for approval; `full` runs unattended with every permission. Grant `full` only when the user asks for it explicitly.
- `deliver`: `inbox` (default) records results quietly and notifies on failure; `push` also notifies the phone on every result; `silent` only records. Approvals, questions, and plans always notify.
- A run that was missed while the machine slept runs once on wake. Failures back off, three in a row pause the routine (`paused: failures`), and `resume` clears it. Each routine runs at most 24 times a day; extra runs are recorded as `skipped`.
- Inside a persona's thread, the `routine` tool group (`routine_list`, `routine_create`, `routine_update`, `routine_run`, `routine_runs`, `routine_delete`) manages that persona's own routines. Tools cannot grant `full` access or change or run a `full` routine.
- Deleting a routine deletes its thread; deleting a persona deletes its routines and their threads.

## Inbox and brief

The inbox gathers what needs the user across every form: pending approvals, questions, and plans, failed or unread finished sessions, and routine results, failures, and auto-pauses. Items are ordered by what needs the user, then failures, then results. The brief is today's summary built from the same data without a model: what needs the user, each routine's latest result today, and failures; it is `null` when there is nothing to report.

```bash
cocurdex inbox [list] --json
cocurdex inbox read <item-id> --json
cocurdex inbox brief [--tz <zone>] --json
```

- `read` marks the item's thread visited, which clears it; do it only after the user has seen or handled the item.
- Use the brief to answer "what happened today" or "what needs me" instead of reading every thread.
