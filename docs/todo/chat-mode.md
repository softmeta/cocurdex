# Chat mode — open todos

Living checklist for pure chat (`features/chat` + `electron/chat` + `packages/llm-chat`).

Related plan: [docs/plans/2026-05-21-chat-mode.md](../plans/2026-05-21-chat-mode.md).

**Scope reminder:** close the chat product loop. Do **not** port agent workspace chrome (tools, permissions, plan panel, sticky prompt navigation, checkpoints) unless a concrete user need appears.

---

## Done recently (context)

- Stick-to-bottom with user-scroll unlock (shared `useStickToBottom`)
- Shared jump controls (`JumpControls` / `resolveJumpButton` in `components/chat`)
- Edit user message + resend (`chat:editMessage`)
- Retry / regenerate assistant turn (`chat:retryMessage`)
- Pi MCP adapter path fix for Electron-bundled main (agent send regression)

---

## P0 — Product hole (do next)

### [ ] System prompt / role presets UI

- **Why:** DB, IPC (`systemPrompt` / `presetId`), and locale strings exist; Phase 8 was marked done in the plan, but there is no UI entry under `features/chat`.
- **What:** Composer or conversation menu entry to edit system prompt; built-in presets + custom text; persist via existing `chat:update`.
- **Out of scope:** Reworking the stream path or inventing a second prompt model.

---

## P1 — Everyday friction

### [ ] Visible feedback when send / edit / retry fails

- **Why:** Failures often only hit `console.error`; the user sees “nothing happened”.
- **What:** Toast or inline error for IPC/network/provider failures on send, edit, and retry.

### [ ] Clear stop / abort presentation

- **Why:** After stop, the assistant row is partial + often `errored`; copy and affordances should read as “stopped”, not a mysterious failure.
- **What:** Distinguish user-aborted vs provider error in status or footer; keep retry available when useful.

### [ ] Web-search in-progress affordance

- **Why:** Plan called for a “Searching the web…” chip during tool/source activity; UI mostly shows final `Sources` only.
- **What:** Lightweight chip or status line while search tool-calls are in flight (no new agent loop).

### [ ] Attachment storage beyond data URLs (watch / later)

- **Why:** Images stored as data URLs bloat `conversation_messages` for large files.
- **What:** Prefer on-disk attachment refs + resolve at send time (similar spirit to agent image import). Defer until size becomes painful.

### [ ] Long-thread performance (observe first)

- **Why:** Transcript is a full `messages.map`; fine for short chats, risky for very long ones.
- **What:** Measure first; virtualize only if real sessions get slow. Do not preemptively virtualize.

---

## P2 — Product expansion (after P0/P1)

### [ ] Conversation search in the sidebar list

### [ ] Folders / tags for conversations

### [ ] Export conversation as Markdown

### [ ] Custom web-search providers (Brave / Tavily / …)

- See plan §6.1 (v1.5). Only after provider-hosted search feels solid.

### [ ] Fork / branch from a mid-thread message

- ChatGPT-style “continue from here in a new branch”. Explicitly not agent session branching.

---

## Explicit non-goals

- Merging pure chat into agent `ChatView` with `if (isChatMode)` branches
- Tool-call / permission / plan / subagent UI in pure chat
- Workspace `@file` mentions as a chat dependency (no workspace)
- Porting agent sticky user-prompt bar or jump-to-prompt side nav “for parity”

---

## Suggested order

1. System prompt / presets UI (P0)
2. Failure toasts + stop presentation (P1)
3. Searching chip (P1)
4. Everything else as demand appears
