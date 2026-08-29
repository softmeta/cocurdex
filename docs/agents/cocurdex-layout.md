# Cocurdex product data

Notes, Issues, views, tags, links, and search indexes live in the existing
app-owned `cocurdex.sqlite`. The daemon owns the database connection.

Product skills use the CLI:

```bash
cocurdex note list|show|create|update|delete|backlinks|tags
cocurdex issue list|show|create|move|delete|views
cocurdex search <query> [--kind note|issue]
```

The SQLite schema is private. Skills must not open the database or write a
parallel `.cocurdex` data tree. Markdown is reserved for explicit import/export.

Skills remain manually installable through Settings or:

```bash
cocurdex skills install --scope project
cocurdex skills install --scope global
```
