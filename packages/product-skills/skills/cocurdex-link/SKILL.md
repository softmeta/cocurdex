---
name: cocurdex-link
description: Link Cocurdex notes through Markdown links and inspect backlinks.
---

# Cocurdex Link

Use stable note ids in Markdown links and update the source note through the
CLI. Verify reverse links with:

```bash
cocurdex note backlinks <target-note-id> --json
```

Issue linking is represented in note Markdown until a dedicated typed relation
command is available. Never edit SQLite directly.
