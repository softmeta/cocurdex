---
name: cocurdex-decide
description: Walk the user through open decisions recorded in Cocurdex issues and notes, ask them one batch at a time with a recommendation for each, and write every answer back. Use when the user asks to settle open questions, pending decisions, TBDs, or what is blocking a plan.
---

# Cocurdex Decide

A decision is an issue labeled `decision`. It is the single place where an
open question lives: its status says whether it is settled, `blocks`
relations say which work waits on it, and notes link to it instead of
keeping their own "open questions" list. Use `/cocurdex-issue` and
`/cocurdex-note` for the commands below.

## Decision issue shape

One question per issue. Title it as the question ("License for the server
packages?"). The body holds:

- `## Context`: why it matters and what it constrains, in a few lines.
- `## Options`: each option with its trade-off, the recommended one first
  and marked `(recommended)` with the reason.
- `## Decision`: absent until settled.

Create the label once if `cocurdex issue labels --json` lacks it:
`cocurdex issue label create --name decision`.

## Workflow

1. Collect open decisions: `cocurdex issue list --label decision --open --json`.
   When the user names a note or issue, narrow to decisions linked to it
   (`cocurdex link list <ref> --json`). Undecided items written into note
   bodies or bundled in one issue ("TBD", "pending", a list of choices)
   become one decision issue each first: create it with the shape above,
   relate it with `issue relate <decision> blocks <work>`, and replace the
   note text with a link to it.
2. Settle what you can without the user. Research facts, versions, prices,
   and availability yourself; resolve a decision when the evidence leaves
   one sound answer, and record it as below with your reasoning. Ask only
   what belongs to the user: taste, money, names, legal and strategic
   choices, or a trade-off between options that are each sound.
3. Ask in batches, highest-impact and most-blocking first. Use your agent's
   structured question tool (Claude Code `AskUserQuestion`, Codex
   `request_user_input`, the OpenCode question tool); without one, ask in
   chat as a numbered list. Each question gives two to four options, puts
   the recommended one first with its reason, and allows a free answer.
   Keep a batch to about four questions.
4. Write each answer back before asking the next batch:
   - `cocurdex issue update <id> --body <markdown>` with a `## Decision`
     section stating the choice, the reason, and who decided;
   - `cocurdex issue move <id> done`;
   - update every linked note that states the open question, passing
     `--expected-revision` from the `note show` you edited.
5. Report what was decided, which issues are now unblocked
   (`cocurdex issue show <id> --detail --json` lists relations), and what
   is still open.

A free answer that opens a new question becomes a new decision issue
instead of being folded into the current one. Never mark a decision done
without an answer from the user or evidence you can cite.
