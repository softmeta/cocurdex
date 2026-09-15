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

## Next

### 1. ADR 0003: client topology

`apps/api/src/app.ts` references ADR 0003 but `docs/adr/` has none. Decide:

- Browser connects directly to the local daemon (loopback WebSocket), or
- Browser and mobile go through a relay/tunnel (`apps/api`), which is required
  for remote control from outside the machine.

Also decide what `apps/web` (Astro docs site) and `apps/console` (Next shell)
are for versus the future web client. Auth design and the provider OAuth
callback URL depend on this.

### 2. Authentication for non-local clients

Current auth is one token read from a local metadata file. Needed before any
listener leaves loopback:

- Device pairing or login, token lifetime and revocation.
- TLS or a tunnel that provides it.
- Per-connection identity for audit; permission and plan-approval prompts must
  be attributable to a client.
- Confirm how provider API keys are stored at rest (`@napi-rs/keyring` is a
  daemon dependency; verify every secret path uses it).

### 3. Move `provider:*` and `codex:*` (31 IPC channels) into the daemon

`apps/desktop/electron/provider/provider-service.ts` (34K) holds provider
configs, API keys, model listing and OAuth login flows. Daemon already has
`provider.*` read methods; writes and auth flows are Electron only.

- OAuth callback handling depends on the ADR 0003 decision.

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

47 renderer files use absolute `rootPath`. Under remote control the path is
the daemon host's. Replace `dialog:openDirectory` with a daemon directory
browse RPC and gate "reveal in file manager" style actions on a host
capability.

### 7. Reconnect and idempotency

Network clients need what loopback does not:

- Event sequence numbers and catch-up after reconnect.
- Idempotency keys or operation receipts for mutating RPCs.
  `docs/daemon-lifecycle.md` already notes receipts as a follow-up.

### 8. Remote terminal

PTY lives in Electron (`electron/pty`). Remote terminal needs a daemon-side
PTY with a streaming channel. Last.

## Environment notes

- Node in use is v24; the repo pins `>=22 <23`. Only a warning so far.
- `node_modules` was corrupt on 2026-09-13 (pnpm reported up to date with an
  empty install). Fixed by deleting `node_modules` and reinstalling.
- Do not `require` `apps/desktop/resources/cli/daemon.cjs` to smoke test it;
  loading it starts a daemon against the real data directory.
