# Product / engineering todos

Open follow-ups that are not yet a full design plan under `docs/plans/`.

## Layout

| Path | Purpose |
|------|---------|
| `docs/todo/README.md` | This index |
| `docs/todo/<area>.md` | One living checklist per product area |

## Conventions

- One area file per domain (e.g. `chat-mode.md`, not one file per ticket).
- Items use checkboxes: `- [ ]` open, `- [x]` done.
- Each open item has **priority** (`P0` / `P1` / `P2`), a short **why**, and optional **notes**.
- When an item grows into real design work, promote it to `docs/plans/YYYY-MM-DD-<slug>.md` and link both ways.
- Prefer English (same as other `docs/` product notes).

## Areas

| File | Area |
|------|------|
| [chat-mode.md](./chat-mode.md) | Pure chat (ChatGPT-style conversations) |
