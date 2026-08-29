---
name: cocurdex-layout
description: Explain Cocurdex app-owned data boundaries and CLI access.
---

# Cocurdex Data Boundary

`cocurdex.sqlite` is the sole source of truth. The daemon owns the database
connection. Desktop, CLI, and integrations use daemon contracts.

Never read or write the private SQLite schema directly. Never create a parallel
`.cocurdex` Notes or Issues tree. Markdown is reserved for explicit
import/export.
