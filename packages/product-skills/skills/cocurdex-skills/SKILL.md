---
name: cocurdex-skills
description: Find, install, update, link, and clean up agent skills (SKILL.md folders) for Claude Code, Codex, Pi, OpenCode, Cursor, and Antigravity through the Cocurdex CLI. Use when the user asks to add a skill from GitHub or a folder, see which skills are installed, update or remove them, or fix duplicate and broken skills.
---

# Cocurdex Skills

Cocurdex manages skills as folders in the shared `.agents/skills` directory,
which Codex, Pi, OpenCode, and Cursor read directly. Claude Code and
Antigravity get a link to the shared folder. Provenance is recorded in the
same lock files as `npx skills` (`~/.agents/.skill-lock.json` for global
skills, `skills-lock.json` in a workspace), so both tools see the same state.

Global skills live under the user's home. Pass `--workspace <id|path>` to work
on a registered workspace instead; without it every command targets global.

```bash
cocurdex skills list [--workspace <id|path>] --json
cocurdex skills show <name> [--workspace <id|path>] --json
cocurdex skills search <query> --json
cocurdex skills sources --json
cocurdex skills inspect <owner/repo|github-url|folder> [--ref <ref>] --json
cocurdex skills add <source> --skill <name|path>[,...] | --all [--workspace <id|path>] [--link claude-code,antigravity] [--replace <name>[,...]] [--ref <ref>] --json
cocurdex skills remove <name> [--workspace <id|path>] --json
cocurdex skills link|unlink <name> --agent claude-code|antigravity [--workspace <id|path>] --json
cocurdex skills share <name> [--workspace <id|path>] --json
cocurdex skills dedupe <name> --keep <path> [--workspace <id|path>] --json
cocurdex skills updates [--workspace <id|path>] --json
cocurdex skills diff <name> [--workspace <id|path>] [--patch] --json
cocurdex skills update <name...> | --all [--workspace <id|path>] --json
cocurdex skills skip <name> [--workspace <id|path>] --json
```

Sources are GitHub repositories (`owner/repo`, `owner/repo/path#ref`, or a
`github.com/.../tree/<ref>/<path>` URL) and local folders. Other hosts are not
supported. Private repositories need `GITHUB_TOKEN` in the daemon environment.

## Working rules

- Run `inspect` before `add` and tell the user what the source contains,
  including skills with scripts (`scripts` > 0) and manifest issues. `add`
  skips skills whose `SKILL.md` lacks frontmatter or a description.
- Skills run with the agent's permissions. Before installing from an
  unfamiliar source, read its `SKILL.md` and scripts (`skills show` after
  install, or the repository) and mention anything that executes code.
- `add` never overwrites. A name that already exists is reported as
  `skipped: exists`; repeat with `--replace <name>` only when the user agrees.
  Replaced and removed folders are kept as backups for 14 days.
- `list` reports `problems`: `invalid` (manifest issues), `duplicate`
  (different copies of one skill in several agent folders), and `brokenLink`.
  Resolve a duplicate with `dedupe --keep <path>` after showing the user the
  copies; the kept copy becomes the shared folder and the others become links.
- `share` moves an agent-specific skill (for example one only in
  `~/.claude/skills`) into the shared folder and leaves a link behind.
- Run `updates` to check GitHub sources, `diff` to show what an update
  changes, and confirm with the user before `update` when `localModified` is
  true; local edits are replaced. `skip` hides the current update until a
  newer commit appears.
- Skills marked `builtin` (the `cocurdex-*` pack) are managed with
  `cocurdex skills pack list|status|install|remove --scope project|global`, not
  with `remove` or `add`. `--scope project` targets the registered workspace
  that contains `--root` (default: the current directory). `status` reports
  `updateAvailable` for a newer bundled pack and `modified` when installed
  files were edited; `install` then updates or restores them (`action:
  "updated"` or `"restored"`), replacing local edits, so confirm first.
  `cocurdex skills pack show <name>` prints a bundled skill's SKILL.md even
  when the pack is not installed (`--json` adds its file list).
- `search` queries the public skills.sh directory, which lists names,
  sources, and install counts but no descriptions; `inspect` the source for
  details.
