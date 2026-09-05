# Verifying changes across desktop processes

## Choose the smallest sufficient runtime

Confirm which process owns each edit before operating the UI. Inspect the actual
electron-vite command and current config; renderer HMR does not imply main or
preload rebuilding. The installed electron-vite CLI documents `--watch` for that
purpose. Reuse an enabled watcher instead of starting another dev server.

Check a new preload method with `typeof window.desktopApi.<method>`. If it is
missing, resolve the bundle/reload boundary first. Do not debug renderer state
against an older API. A successful bundle build does not update an existing
process by itself.

For daemon changes, run `rtk pnpm --filter @cocurdex/desktop prepare:cli`. Restart
the intended daemon only when doing so will not interrupt unrelated work. Check
`window.desktopApi.getDaemonStatus()` for `matchesRuntime`, both fingerprints,
PID, and socket path. Record those before trusting a persistence test.

## Isolated Electron verification

Use this when real IPC/persistence verification is needed, the frontend server
is already running, and the user's main process is stale or their data should
not be touched. It validates the built changes; it does not update their window.

1. Resolve the current repository path and the existing renderer URL. Pick a
   free CDP port and a unique temporary userData directory. Keep an explicit
   record of the test profile and process IDs for cleanup.
2. Rebuild only main/preload with the installed `electron-vite.resolveConfig`
   and Vite `build` API, using the desktop directory as cwd. Rebuild the bundled
   daemon separately if it changed. The following is a template for a temporary
   `.mjs` script; substitute the real repository paths before running it:

   ```js
   import { resolveConfig } from '<desktop>/node_modules/electron-vite/dist/index.js';
   import { build } from '<desktop>/node_modules/vite/dist/node/index.js';
   process.chdir('<desktop>');
   const resolved = await resolveConfig({ logLevel: 'warn' }, 'serve', 'development');
   await build(resolved.config.main);
   await build(resolved.config.preload);
   ```

3. Launch the installed Electron binary with a temporary `.mjs` entry. Set
   `COCURDEX_REMOTE_DEBUGGING_PORT` and `ELECTRON_RENDERER_URL` for that process.
   The entry must set the temporary userData path **before** importing main;
   keep the real app path so packaged resources and preload paths resolve:

   ```js
   import { app } from 'electron';
   app.setPath('userData', '<unique-temporary-profile>');
   app.setAppPath('<desktop>');
   await import('<desktop>/out/main/main.js');
   ```

   Inspect `resolveUserDataPath` first: development currently appends `-dev`.
   Confirm the resulting socket/profile is isolated. Do not start a second Vite
   server or change the user's saved startup command for this procedure.
4. Pass the test CDP port to the existing helper using its environment variable.
   Confirm the new API exists and the daemon fingerprint matches. Seed only
   disposable records in this profile, using the current payload contracts.
5. Drive the real UI for the mutation and inspect both the resulting UI and a
   fresh persistence read. API-only seeding does not hydrate renderer atoms;
   bootstrap the test renderer or deliberately hydrate the test fixture before
   asserting sidebar behavior. Never count test-injected state as proof that a
   production action updated the renderer.
6. Close only the test process, verify its owned daemon exited, and report any
   remaining restart needed for the user's existing development window. Use
   exact observed PIDs, never broad Electron/daemon process-name kills.

Keep GUI, port, and filesystem operations within the current tool permissions;
this procedure is not permission to bypass a sandbox rejection.

## Avoid duplicate Vite modules during CDP inspection

Prefer a visible UI assertion to importing internal state. If a store must be
inspected, obtain the current import URLs from the transformed module that the
live component uses. `performance.getEntriesByType('resource')` can help find
dependency URLs, but its buffer may omit later source modules. Fetching the
current transformed entry can reveal its versioned child imports; confirm they
match the component under inspection after HMR.

Use the full URL for **both** Jotai and the session/workspace module. Omitting
`?v=...` on Jotai or `?t=...` on an atom module can produce a separate instance.
If the UI, persistence, and imported store disagree, check module identity before
changing production code. Do not patch the UI store merely to make a test pass.

After an action, prefer `eval ACTION --wait CONDITION` when the target context
survives, or use `wait CONDITION` after navigation. An evaluation returning
`undefined` proves neither that navigation
finished nor that bootstrap ran. Verify the expected rendered state and fresh
API data. Treat renderer state, API state, and persisted state as separate checks.

## Sources and local owners

- [CDP Runtime.evaluate](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-evaluate): promise evaluation, exceptions, and runtime timeouts.
- [TypeScript Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API): program/host and diagnostic APIs; use the repository's installed version.
- `apps/desktop/electron.vite.config.ts` and the installed electron-vite CLI: build/watch behavior.
- `apps/desktop/electron/app-paths/resolve-user-data-path.ts`: profile isolation.
- `apps/desktop/electron/chat/daemon-runtime-client.ts`: runtime status and restart.
- `scripts/typecheck-changed.mjs`: package-local compiler host and selected-file diagnostics.
