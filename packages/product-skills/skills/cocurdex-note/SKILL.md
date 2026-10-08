---
name: cocurdex-note
description: Create, update, and link app-owned Cocurdex notes through the CLI, including PRDs and technical specs.
---

# Cocurdex Note

Notes are app-owned SQLite records with stable ids. Use `cocurdex note`; do not
write a parallel Markdown tree or open the SQLite file.

```bash
cocurdex note list --json
cocurdex note show <id> --json
cocurdex note create --title <title> [--body-file <path>] [--parent <id>] --json
cocurdex note update <id> [--title <title>] [--body-file <path>] --json
cocurdex note move <id> --parent <folder-id> | --root --json
cocurdex note backlinks <id> --json
cocurdex note tags [<id>] --json
```

If the prompt already contains an attached `<note … complete="true">` block,
treat it as the full note and do not run `cocurdex note show` for it. Use the
CLI only to change the note, or when the user asks for its current state.

PRDs and specs are ordinary notes: write the Markdown, save it with
`note create`, and update the returned id with `note update`. Pass long or
multi-line bodies with `--body-file <path>` or pipe them with `--body -`;
`--body <markdown>` is only for short single-line text.

The note body is a collaborative document; the Markdown you send is merged
into it, and the stored body comes back normalized. Use the `bodyMarkdown`
returned by the command as the current text. Supported blocks: headings,
lists, task lists, tables, images, quotes, and code. Unsupported syntax such
as raw HTML is kept as plain text.

`note update` fails with "Note was modified" when someone edited the note
after you read it. Run `note show` again, reapply your change to the new
body, and retry.

Link notes with Markdown links that use stable note ids, then verify the
reverse direction with `note backlinks <target-id>`.

Markdown is the note body format at the API boundary, not an on-disk source of
truth. Publishing a note to a repository requires an explicit export flow.
