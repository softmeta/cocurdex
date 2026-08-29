---
name: cocurdex-prd
description: Draft a PRD and save it as an app-owned Cocurdex note.
---

# Cocurdex PRD

Write the PRD in Markdown, then persist it through:

```bash
cocurdex note create --title <title> --body <markdown> --json
```

Use the stable note id for later updates. Do not write repository files unless
the user separately requests an explicit export.
