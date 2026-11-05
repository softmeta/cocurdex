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

- `forget` is reversible: `history` lists the deleted entry with its full id, and `restore` takes that full id.
- Edit an entry in place with `update` instead of storing a near-duplicate; read it back with `show`.
- `list` reports `error` when memory is off or not installed; relay the fix it names (see `/cocurdex-settings`) instead of retrying.
- Export writes the whole library as plaintext JSON. Only export or import when the user asks, and tell them where the file is.
