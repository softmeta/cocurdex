---
name: cocurdex-note
description: Create and update app-owned Cocurdex notes through the CLI.
---

# Cocurdex Note

Notes are app-owned SQLite records with stable ids. Use `cocurdex note`; do not
write a parallel Markdown tree or open the SQLite file.

```bash
cocurdex note list --json
cocurdex note show <id> --json
cocurdex note create --title <title> [--body <markdown>] [--parent <id>] --json
cocurdex note update <id> [--title <title>] [--body <markdown>] --json
cocurdex note backlinks <id> --json
cocurdex note tags [<id>] --json
```

If the prompt already contains an attached `<note … complete="true">` block,
treat it as the full note and do not run `cocurdex note show` for it. Use the
CLI only to change the note, or when the user asks for its current state.

Markdown is the note body format at the API boundary, not an on-disk source of
truth. Publishing a note to a repository requires an explicit export flow.
