---
name: debug-desktop
description: Attach to the running Cocurdex Electron desktop app over Chrome DevTools Protocol (CDP) to read renderer console, evaluate JS, inspect the DOM, and screenshot. Use when verifying a desktop change, reproducing a renderer bug, reading runtime errors/logs, or driving the UI for inspection. Triggers on "debug the desktop app", "check the renderer console", "attach CDP", "screenshot the app", "why does X throw at runtime".
---

# Debug Cocurdex desktop (CDP)

All renderer inspection goes through raw CDP via the bundled zero-dependency helper
`scripts/cdp.mjs` (Node built-in `fetch` + `WebSocket`). No Playwright, no project
dependency, runs from any cwd.

The existing Playwright `connectOverCDP` attempt timed out. Raw CDP is the tested
project path; use it instead of repeating that handshake experiment during an
unrelated desktop task.

## 0. Check the running process before choosing a verification path

Reuse the user's development process. Run the read-only preflight first:

```bash
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs preflight --url http://localhost:5173/ --api listArchivedSessions
```

Use the real page URL from `targets`, and replace the example API with the method
being tested. Repeat `--api` for several methods. The report includes candidate
development processes, CLI watch flags, target IDs, API presence, and daemon
fingerprints. It does not execute Vite config or infer source freshness from API
presence. Missing flags, unavailable process inspection, and port/process
association remain explicit unknowns. Exit 0 means the requested methods exist
and the daemon reports a matching running runtime, not that all code is current.

`dev:inspect` enables CDP; it does not
by itself prove that main/preload watch mode is enabled. Per AGENTS.md, do not
start the desktop dev server yourself when it is absent.

| Changed boundary | Evidence needed before testing |
| --- | --- |
| Renderer | The changed module has loaded through HMR or a confirmed reload. |
| Preload / main IPC | Rebuilt bundles and a renderer reload / Electron restart as applicable. Check `typeof window.desktopApi.<method>` before testing a new API. |
| Bundled daemon / database | Rebuild `prepare:cli`, restart the applicable daemon, and check `getDaemonStatus()` reports matching actual and expected runtime fingerprints. |

When changes cross process boundaries, read
[references/process-verification.md](references/process-verification.md).
It includes an isolated Electron procedure that reuses an existing frontend
server when the user's running main/preload cannot reload the new code.

An `EPERM` connecting to the local port is a sandbox restriction, not evidence
that the app is stopped. Use the normal escalation mechanism for the read-only
probe. A refused connection means the selected port is not listening.

### Critical gotcha — origin allowlist
`main.ts` sets `remote-allow-origins=http://127.0.0.1:9222`. Always use
**`127.0.0.1`, never `localhost`**, or the CDP websocket is rejected. The helper
already does this.

## 1. Renderer: eval / screenshot / target list

```bash
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs targets
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs eval "document.title" --url http://localhost:5173/
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs wait "document.readyState === 'complete'" --target TARGET_ID --timeout 5000
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs shot /tmp/cocurdex.png --target TARGET_ID
```

`targets` returns JSON with IDs. `--target` selects an exact ID; `--url` selects an
exact URL. Multiple matching pages cause an error rather than selecting the
first window. `--port` overrides `COCURDEX_REMOTE_DEBUGGING_PORT`.

`eval` returns a JSON envelope containing `targetId` and `result`, awaits promises,
and includes exception details and stack traces on failure. Use `eval ACTION
--wait CONDITION` to run an action once and poll its result in the same call.
`wait CONDITION` only polls. Conditions must be read-only, since they repeat.
`--interval` sets polling frequency; `--timeout` bounds each connection/request
or condition wait, defaults to 10 seconds, and is capped at 60 seconds. A timeout
does not roll back an action or cancel application work; inspect before retrying.
Connection loss and evaluation errors stop the wait without replaying actions.

For DOM/UI checks, query inside the expression (`innerText`,
`querySelector(...).getBoundingClientRect()`, etc.). Read captured images back
with the image tool to verify layout.

The helper's transport regression tests use a disposable Node inspector process:
`rtk node --test .agents/skills/debug-desktop/scripts/cdp-client.test.mjs`.

Prefer UI interaction and the public preload API for verification. When a store
read is necessary, use the exact module URLs loaded by the app, including Vite
`?t=...` and `?v=...` query strings. A bare-path dynamic import can instantiate a
second atom or Jotai store and report an empty state while the actual UI is
correct. See the reference for locating these URLs and confirming reloads.

## Targeted TypeScript validation

From the repository root, run the shared helper before Biome:

```bash
rtk node scripts/typecheck-changed.mjs
rtk node scripts/typecheck-changed.mjs apps/desktop/src/path/to/changed.tsx
```

The default selects staged, unstaged, and untracked TypeScript files; explicit
paths narrow the scope. It uses each owning tsconfig and the installed package
TypeScript, falling back to the desktop workspace's compiler when the package
has none. The compiler host stays rooted at the owning package. It reports
selected-file plus
configuration/global diagnostics and emits nothing. This is not a full consumer
or package typecheck: use broader checks when an exported contract change needs
them. Do not install a second TypeScript version to run this helper.

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
