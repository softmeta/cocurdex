# TODO: web, mobile, and remote control prerequisites

Status as of 2026-09-14. Items 1 to 3 below shipped in the daemon Git RPC and
transport-neutral client work.

## Done

- `@cocurdex/rpc/client`: transport-neutral daemon client
  (`createDaemonRpcClient`, `createWebSocketTransport`). Daemon socket client
  is now `createSocketTransport` in `packages/daemon/src/client.ts`.
- Daemon WebSocket listener: `startDaemonServer({ webSocketPort })` or
  `COCURDEX_DAEMON_WS_PORT`. Loopback only, same token, URL published as
  `webSocketUrl` in daemon metadata. See `docs/daemon-lifecycle.md`.
- `git.*` RPC (11 methods) in daemon under `packages/daemon/src/git/`;
  Electron `git:*` handlers are thin forwards. Git types moved to
  `packages/shared/src/git.ts`. Protocol version 22.
- Formerly Electron-only product APIs are daemon RPC on protocol 23:
  `workspace.listEntries`/`workspace.listFiles`, `file.readText`/`file.exists`,
  `search.start`/`search.cancel` (results stream as `search.*` daemon events,
  bridged to `search:result`/`search:done`/`search:error` in the host),
  `mcp.readConfig`/`mcp.saveConfig`, `skills.getStatus`/`skills.install`/
  `skills.remove`, `pdf.loadAnnotations`/`pdf.saveAnnotations`. Blank
  `git.commit` messages are generated daemon-side from the configured
  commit-message model. Root authorization for listings, search, and PDF
  annotations is daemon-owned (`packages/daemon/src/scan-roots.ts`).
- Alias maps that must list `@cocurdex/rpc/client` before `@cocurdex/rpc`:
  `electron.vite.config.ts`, `scripts/build-cli.mjs`, `vitest.config.ts`,
  `apps/desktop/tsconfig.json`, root `tsconfig.base.json`.
- ADR 0003 (`docs/adr/0003-client-topology-loopback-only.md`): loopback-only
  clients for this phase; relay, non-local auth and OAuth callback redesign
  deferred until a future topology decision.
- Non-interactive provider functionality moved into daemon RPC on protocol 24:
  `provider.listTemplates`, `provider.config.*`, `provider.model.*`,
  `provider.fetchModels`/`provider.listAllModels` (models.dev enrichment),
  `provider.default.*`, `provider.titleModel.*`, `provider.auth.read`/
  `provider.auth.logout`, `provider.listModels`/`provider.listConfigs`/
  `provider.listCompatibleForAgent`/`provider.listDefaults`. Daemon modules
  live under `packages/daemon/src/provider/`; Electron keeps interactive
  OAuth/Codex login and session-title generation only.
- Reconnect and idempotency on protocol 24: daemon events carry sequence
  numbers from a bounded in-memory journal (`event-journal.ts`);
  `daemon.subscribe` accepts `afterSeq` and replays before going live; the rpc
  client buffers pre-handshake events and exposes `subscription.lastSeq`.
  Mutating requests accept `idempotencyKey`; `rpc-receipts.ts` coalesces
  in-flight duplicates and replays stored outcomes. See
  `docs/daemon-lifecycle.md`.
- `fs.listDirectories` daemon RPC (`fs-browse.ts`) lists directories on the
  daemon host for workspace-root picking. `DesktopApi.capabilities`
  (`HostCapabilities`) reports host abilities — `fileManager`,
  `nativeDirectoryDialog` — and reveal-in-file-manager menu items are gated on
  `capabilities.fileManager`. The Electron `fs:listDirectories` IPC is a thin
  forward.

## Next

### 1. ADR 0003: client topology

Done — loopback only, see ADR 0003 in Done above. A future decision may add a
relay (`apps/api` is reserved for a cloud/team API boundary, not local daemon
relay) or re-decide remote access; that would reopen authentication, TLS and
the OAuth callback URL.

### 2. Authentication for non-local clients

Current auth is one token read from a local metadata file. Needed before any
listener leaves loopback:

- Device pairing or login, token lifetime and revocation.
- TLS or a tunnel that provides it.
- Per-connection identity for audit; permission and plan-approval prompts must
  be attributable to a client.
- Confirm how provider API keys are stored at rest (`@napi-rs/keyring` is a
  daemon dependency; verify every secret path uses it).

### 3. Move `provider:*` and `codex:*` into the daemon

Partially done on protocol 24 — see Done. Remaining Electron-only pieces are
the interactive login flows: `provider:authLogin*` (OAuth browser flow) and
the `codex:*` login channels. They stay host-side until a future topology
decision defines the OAuth callback URL for non-local clients.

### 4. Remaining host-only product logic

Done on protocol 23 — see Done. `pdf:read-data` (pdf-asset:// URL) stays in
Electron since serving the file is a host capability; annotation persistence
is daemon-side. Stays in Electron: `window`, `dialog`, `shell`, `app:update`,
`cli`, `browser` (BrowserView), `pty`, `fonts`, `editorView`, `log`, file
watching (`workspace-watch-service.ts`, which keeps its own `git-client.ts`).

### 5. Split the renderer `desktopApi` surface

`apps/desktop/src/lib/types.ts` (`DesktopApi`) and `lib/ipc.ts` expose 166
methods through one proxy. Split into:

- Product API backed by the rpc client (shared by desktop, web, mobile).
- Host API, optional; UI hides features when the capability is absent.

Then extract the renderer into a shared UI package.

### 6. Path semantics for remote clients

Daemon-side pieces done: `fs.listDirectories` browse RPC and
`DesktopApi.capabilities` with reveal-in-file-manager gating. Remaining:

- 47 renderer files still treat `rootPath` as a local path. Under remote
  control it is the daemon host's; audit and adjust copy/UI assumptions.
- Replace `dialog:openDirectory` call sites with a picker built on
  `fs.listDirectories` for clients lacking `nativeDirectoryDialog`.

### 7. Reconnect and idempotency

Done on protocol 24 — see Done. Follow-ups:

- Receipts are in-memory and per daemon lifetime; a restart loses them.
- Clients that mutate must opt in by sending `idempotencyKey`; desktop call
  sites do not yet attach keys.

### 8. Remote terminal

PTY lives in Electron (`electron/pty`). Remote terminal needs a daemon-side
PTY with a streaming channel. Last.

## Environment notes

- Node in use is v24; the repo pins `>=22 <23`. Only a warning so far.
- `node_modules` was corrupt on 2026-09-13 (pnpm reported up to date with an
  empty install). Fixed by deleting `node_modules` and reinstalling.
- Do not `require` `apps/desktop/resources/cli/daemon.cjs` to smoke test it;
  loading it starts a daemon against the real data directory.
