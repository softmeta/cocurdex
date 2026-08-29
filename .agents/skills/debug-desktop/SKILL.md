---
name: debug-desktop
description: Attach to the running Cocurdex Electron desktop app over Chrome DevTools Protocol (CDP) to read renderer console, evaluate JS, inspect the DOM, and screenshot. Use when verifying a desktop change, reproducing a renderer bug, reading runtime errors/logs, or driving the UI for inspection. Triggers on "debug the desktop app", "check the renderer console", "attach CDP", "screenshot the app", "why does X throw at runtime".
---

# Debug Cocurdex desktop (CDP)

All renderer inspection goes through raw CDP via the bundled zero-dependency helper
`scripts/cdp.mjs` (Node built-in `fetch` + `WebSocket`). No Playwright, no project
dependency, runs from any cwd.

> Playwright `connectOverCDP` was tried and **does not work** against this Electron
> build (Electron 41 / Chromium 146) — the handshake times out. Do not reintroduce
> it. Raw CDP is the supported path.

## 0. Start the app with CDP enabled

```bash
pnpm --filter @cocurdex/desktop dev:inspect
```

Sets `COCURDEX_REMOTE_DEBUGGING_PORT=9222`; `electron/main.ts` turns it into
`--remote-debugging-port=9222`. Plain `dev` has **no** CDP — must be `dev:inspect`.

> Per AGENTS.md the user normally launches the dev server themselves. Confirm it's
> running before attaching. Probe: `curl -s http://127.0.0.1:9222/json/version`.

### Critical gotcha — origin allowlist
`main.ts` sets `remote-allow-origins=http://127.0.0.1:9222`. Always use
**`127.0.0.1`, never `localhost`**, or the CDP websocket is rejected. The helper
already does this.

## 1. Renderer: eval / screenshot / target list

```bash
S=.agents/skills/debug-desktop/scripts/cdp.mjs
node $S targets                          # list CDP targets
node $S eval "document.title"            # evaluate JS in the renderer
node $S eval "document.querySelectorAll('button').length"
node $S shot /tmp/cocurdex.png           # screenshot -> read it back with Read tool
```

`eval` returns the JSON-serialized value, awaits promises, and reports renderer
exceptions. For DOM/UI checks, query inside the expression (`innerText`,
`querySelector(...).getBoundingClientRect()`, etc.).

## 2. Streaming renderer console

For a live console stream (not one-shot eval), reuse the existing listener:

```bash
pnpm --filter @cocurdex/desktop perf:listen          # filtered
pnpm --filter @cocurdex/desktop perf:listen -- --all # full console
```

`scripts/listen-renderer-perf.mjs` — long-running; start in background, read output.

## 3. Main-process logs (NOT reachable over CDP)

`configureLogging` (main.ts ~775) writes via `electron-log` to `app.getPath("logs")`.
macOS (productName `Cocurdex`):

```bash
tail -f ~/Library/Logs/Cocurdex/*.log
```

Diagnostics dumps: `<userData>/diagnostics/`. Use these for crashes, IPC, agent/
session backend errors — none of which surface in the renderer console.

## Troubleshooting
- `No CDP at http://127.0.0.1:9222` → app not started with `dev:inspect`.
- Empty/refused target list → used `localhost` instead of `127.0.0.1`, or app down.
- DevTools (`devtools://`) targets are filtered out by the helper automatically.
