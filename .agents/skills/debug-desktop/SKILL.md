---
name: debug-desktop
description: Attach to the running Cocurdex Electron desktop app over Chrome DevTools Protocol (CDP) to read renderer console, evaluate JS, inspect the DOM, screenshot, and record frame-by-frame screencasts. Use when verifying a desktop change, reproducing a renderer bug, chasing a flicker or content jump, reading runtime errors/logs, or driving the UI for inspection. Triggers on "debug the desktop app", "check the renderer console", "attach CDP", "screenshot the app", "record the screen", "录屏", "it flickers/jumps", "why does X throw at runtime".
---

# Debug Cocurdex desktop (CDP)

The user authorizes read-only testing against real sessions in both Cocurdex and Cocurdex-dev, including pairing test devices, browsing, recording, and measurement. Do not require isolated data or ask again merely because the data is real. Identify which host owns the reported session before pairing or reproducing it. This authorization does not include sending messages or modifying session content. Restore temporary UI changes afterward and revoke temporary test pairings. Use isolated fixtures for automated checks that reset or repeatedly mutate data.

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
by itself prove that main/preload watch mode is enabled. Per AGENTS.md, start
or restart `pnpm --filter @cocurdex/desktop dev:inspect` yourself whenever
verification needs it, instead of asking the user:

1. Find the running dev tree with `ps -axo pid,ppid,command` (the `pnpm ...
   dev:inspect` root and its descendants). Skip the restart and use an isolated
   instance if an agent run in that app is in progress.
2. Stop that tree by PID, children first, then confirm the CDP port is closed.
3. Relaunch detached so it outlives your shell:
   `nohup pnpm --filter @cocurdex/desktop dev:inspect > <scratchpad>/dev.log 2>&1 &`.
4. Wait for `http://127.0.0.1:9222/json/list` in a background loop, then
   check `getDaemonStatus().matchesRuntime` and the fingerprint.
5. Tell the user the app restarted and where the log is.

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

### How CDP is enabled
Every build, dev or packaged, opens CDP only when `COCURDEX_REMOTE_DEBUGGING_PORT`
is set at launch (`configureRemoteDebugging` in `electron/main.ts`); without it
CDP is off. `dev:inspect` sets it to 9222.

### Critical gotcha — origin allowlist
`main.ts` sets `remote-allow-origins=http://127.0.0.1:<port>`. Always use
**`127.0.0.1`, never `localhost`**, or the CDP websocket is rejected. The helper
already does this.

### Attach to a packaged build
Reproduce packaged-only behavior (production bundle, real data volume) by
launching the installed app with the variable, on a port other than 9222:

```bash
# macOS
COCURDEX_REMOTE_DEBUGGING_PORT=9333 /Applications/Cocurdex.app/Contents/MacOS/Cocurdex
# Linux
COCURDEX_REMOTE_DEBUGGING_PORT=9333 ./Cocurdex-linux-x64.AppImage
# Windows (PowerShell, per-user install)
$env:COCURDEX_REMOTE_DEBUGGING_PORT=9333; & "$env:LOCALAPPDATA\Programs\Cocurdex\Cocurdex.exe"
```

Then pass `--port 9333` to `cdp.mjs`.

- Quit the running packaged app first. The single-instance lock makes a second
  launch exit at once, and no CDP port opens.
- It uses the user's real profile (no `-dev` suffix). Keep checks read-only and
  restore what you change, or set a short `COCURDEX_USER_DATA_PATH` to isolate it.

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

### Recording frames (flicker, jumps, transitions)

A screenshot shows one moment; a jump or flash lives between moments. Record
every composited frame with CDP `Page.startScreencast`:

```bash
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs cast <dir> --url http://localhost:5173/ --action "<click or navigate expression>" --duration 2000
COCURDEX_SCENARIO_RECORD_DIR=<dir> rtk node tests/scenarios/<name>.mjs
```

`cast` starts recording, runs `--action` once, records for `--duration` ms,
and writes `NNNN-<ms>ms.jpg` (ms since recording started) plus `frames.json`.
With `COCURDEX_SCENARIO_RECORD_DIR`, `runScenario` records the whole run,
reloads included, into `<dir>/<scenario>/` and reports the frame count; in a
script, `recordScreencast(session, dir)` from `tests/scenarios/lib/app-session.mjs`
returns `{ stop() }`. Both use `scripts/cdp-screencast.mjs`.

- Chromium sends a frame only when the compositor produces one, so a static
  page yields one frame. Gaps in the file timestamps are idle time.
- Read frames back with the image tool around the timestamps that matter.
- Pair the recording with a `requestAnimationFrame` sampler in the page
  (effective ancestor opacity, `scrollTop`/`scrollHeight`, key element
  presence) when you need the exact frame and pixel delta of a change; then
  assert "first visible frame equals final frame" in a scenario, as
  `tests/scenarios/chat-first-reveal.mjs` does.
- For cold-load behavior of a lazy chunk, let Vite transform it once, then
  `Page.reload` and record. A fresh `electron-vite dev` server compiles large
  chunks for seconds on first request, which measures Vite, not the app.

### Secondary windows

A scenario session can attach to another window of the same instance:
`await session.openPage("window=deck-audience")` waits for a page whose URL
contains the fragment and returns a session with the same `run`, `waitUntil`,
`send`, and `close`; `await session.pageUrls()` lists open pages, so a test can
assert that a window opened or closed. Send keys to that window with its own
`send("Input.dispatchKeyEvent", ...)`. `tests/scenarios/decks.mjs` drives a
presenter window and its audience window this way.

### Native window controls

Screenshots over CDP capture only the page, never the macOS traffic lights or
the Windows/Linux caption buttons drawn over it, so a header that sits under
them looks fine in a screenshot. Measure instead: on macOS
`html[data-traffic-lights]` is set and content must start at or after 80px;
elsewhere resolve `--titlebar-controls-inset` with a probe element
(`width: var(--titlebar-controls-inset)`) and keep controls left of
`innerWidth - inset`.

### Light and dark themes

`data-theme` on `<html>` is the only light/dark switch; CSS tokens and `dark:`
utilities read it. Do not set it by hand: that skips the active preset's token
map and the window surface color. In dev builds, preview a theme without
touching the stored setting, then restore it:

```bash
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs eval "window.__cocurdexDebug.previewTheme('dark')" --url http://localhost:5173/
rtk node .agents/skills/debug-desktop/scripts/cdp.mjs eval "window.__cocurdexDebug.restoreTheme()" --url http://localhost:5173/
```

The hook is installed at startup, so a renderer loaded before it existed needs a
reload. Cover both themes when a change touches colors, backgrounds, or
transparency.

A screenshot does not prove that thin lines are visible. In each theme, measure
the borders and dividers of the view you changed: read the computed
`border-*-color` and the color of the surface the line sits on (the nearest
ancestor with a non-transparent `background-color`), and composite translucent
colors over that surface. Low-alpha tokens such as `--border` (10% white in
dark) behave differently on every surface, so compare each surface the same
line crosses, for example a table's header row against its body rows. A line
that has clearly less contrast on one surface than on the page background is a
defect; fix the surface or the token rather than the single element.

## Concurrent instances and scenarios

Other worktrees and agents may be testing at the same time. For anything that
does not need the user's real data, use an isolated instance through the
scenario launcher in `tests/scenarios/lib` rather than the user's app on 9222:

```bash
rtk node tests/scenarios/pdf-reader.mjs                 # isolated instance + fixture
rtk node tests/scenarios/pdf-reader.mjs --fixture book  # another fixture
rtk node tests/scenarios/pdf-reader.mjs --keep          # leave it running, prints pid/port/paths
rtk node tests/scenarios/stop-instance.mjs --pid <pid> --user-data <path> --workspace <path>
rtk node tests/scenarios/pdf-reader.mjs --port 9222 --pdf <path in a user workspace>
```

`launchIsolatedInstance` creates a short `mkdtemp(os.tmpdir(), "cocu-")`
profile, picks a free CDP port, runs this checkout's own `electron-vite dev`
(Vite moves to the next free port), parses the renderer URL from the log, and
waits for the CDP target. `openScenarioApp` copies fixtures into a temporary
workspace, saves it through `daemonProductApi.saveWorkspace`
(`/src/lib/product-api.ts`; `window.desktopApi` has no `saveWorkspace`), and
reloads: the onboarding gate is decided at bootstrap from the workspace and
provider lists, so a workspace saved before the reload skips the welcome
screen. Stopping kills the recorded PID tree and waits for every process to
exit before removing the profile; the log is kept only when the run fails.
Three instances, two isolated plus one attached to 9222, ran the PDF scenario
in parallel without interference.

Reach views through `tests/scenarios/lib/navigate.mjs` instead of rediscovering
entry points: `showPanelView(session, "notes" | "issues" | "files" | "git" |
"terminal" | "browser" | "pdf")` opens the editor panel and its tab,
`openNote(session, title)` opens a note (the fixture database has "Checkout
spec", "Acme Shop roadmap", and "Scratchpad"), and `openNewIssueDialog(session)`
opens the new-issue dialog with its body editor at `BODY_EDITOR_IN_DIALOG`.
When you find the path to another view, add it there in the same change. For
ad-hoc exploration, start a scenario with `--fixture-db --keep` and drive the
kept instance from a scratch script that imports these helpers and
`openAppSession({ port, url })`; the kept dev server survives source edits, so
reload the renderer instead of relaunching.

Lessons from building it:

- Keep the profile path short. On macOS a socket path over 103 bytes makes the
  daemon refuse to start, and the desktop app only reports "Timed out waiting
  for the Cocurdex daemon"; a scratchpad-based profile path is too long.
- Do not borrow another instance's renderer URL (`cdp.mjs launch` copies it
  from `--from-port`): across worktrees that runs another checkout's code.
- Find instance processes by PID tree, not by grepping the profile path. The
  Electron main process command line (`Electron .`) does not contain it, and
  the daemon runs in its own process group, so a group or path kill leaves the
  main process and the daemon behind, and the main process respawns helpers.
- After a reload, wait for the UI control you need before clicking it; the
  right panel starts closed in a new profile (`editor:actions.openEditorPanel`).
- `bootstrapWorkspaces` drops open PDFs outside the renderer's workspaces, and
  `openPdfReaderAtom` does not open a closed right panel.

`cdp.mjs launch` remains for a quick second Electron against an already built
`out/main/main.js` in the same checkout. A distinct `COCURDEX_USER_DATA_PATH`
is mandatory either way: the single-instance lock and `daemon.sock` live under
the userData profile.

A change that spans the renderer and the daemon breaks the user's running app
in between: Vite HMR loads the new renderer at once, while the old daemon lacks
the new route or method. Restart dev yourself as soon as the daemon side is
ready (see above); the restarted app spawns the rebuilt daemon. Confirm
`getDaemonStatus().matchesRuntime` and the fingerprint before measuring. Wait
for the port in a background loop (`curl -sf http://127.0.0.1:9222/json/list`)
instead of polling with evals.

### Measuring network in the renderer

A long-running dev renderer has usually filled the default 250-entry Resource
Timing buffer, so new requests are not recorded. Call
`performance.setResourceTimingBufferSize(10000)` and
`performance.clearResourceTimings()` before the action you measure. Cross-origin
entries (the daemon's `http://127.0.0.1:<port>`) report `encodedBodySize` 0
without `Timing-Allow-Origin`; count requests and read `responseStatus` and
`duration` instead.

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
- `No CDP at http://127.0.0.1:9222` → app not started with `dev:inspect`, or a packaged app launched without `COCURDEX_REMOTE_DEBUGGING_PORT` (or already running before the relaunch).
- Empty/refused target list → used `localhost` instead of `127.0.0.1`, or app down.
- DevTools (`devtools://`) targets are filtered out by the helper automatically.
