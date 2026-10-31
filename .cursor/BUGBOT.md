# Bugbot review rules for Cocurdex

## What to report

Report only findings you can state as a concrete trigger and a wrong, observable result: the input, state, or sequence of user actions, and what breaks. Prioritize:

- Loss or corruption of persisted data (`cocurdex.sqlite`, its migrations, persisted JSON columns).
- A remote principal (paired device, web client) reaching a filesystem path outside its registered workspaces.
- Crashes, hangs, leaked processes, timers, listeners, or object URLs with a realistic trigger.
- Behavior that breaks on Windows or Linux: POSIX-only shell commands, signals, hardcoded `/` or `/tmp`, case-sensitive path comparison, `.cmd` shims spawned without cross-spawn.
- User-visible wrong behavior in the desktop or web client.

Mark severity honestly: High for data loss, security, or crashes; Medium for user-visible wrong behavior with a realistic trigger. Do not post Low-severity findings.

## What not to report

- Missing code comments, JSDoc, or documentation. The project forbids them; intent lives in names, types, and tests.
- Style, naming, formatting, import order, or refactors without a behavioral defect. Biome and TypeScript enforce these in CI.
- Missing tests on their own, or speculative risks without a reachable trigger.
- Code the pull request did not change.
- A finding already answered and resolved in an earlier review thread of the same pull request, unless the code it refers to changed since.

## Project facts

- TipTap 3 `StarterKit` registers `Underline`, `Link`, `ListKeymap`, and `TrailingNode` itself; they need no separate extension.
- UI primitives are Base UI and compose through the `render` prop; some wrappers in `apps/desktop/src/components/ui` also accept `asChild` for the same purpose.
- SQLite is owned by the daemon (`packages/daemon`); clients, the CLI, and Electron reach it only through daemon RPC.
- Third-party executables are spawned through `spawnCommand` (cross-spawn), and process trees are stopped with `killProcessTree`.
- Tests live under the root `tests/` folder, not next to source files.
