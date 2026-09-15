# ADR 0003: Client topology — loopback only

## Status

Accepted (2026-09-15)

## Context

Product capabilities live in the daemon and are exposed through
`@cocurdex/rpc`. The desktop renderer reaches them through Electron IPC
forwarding, the CLI over the daemon socket, and the daemon also publishes a
loopback WebSocket listener (`startDaemonServer({ webSocketPort })`) for
browser-class clients. Two topologies were considered for web and mobile
clients:

- **Loopback direct**: the browser connects straight to the local daemon's
  `127.0.0.1` WebSocket, using the same auth token as socket clients.
- **Relay/tunnel**: clients connect to `apps/api` (or another cloud relay),
  which forwards to the user's daemon. This is the only option that supports
  controlling a machine from outside its own network, but it requires
  non-local authentication, TLS or an equivalent tunnel, per-connection
  identity for audit, and attributable permission/plan-approval prompts
  before any listener can leave loopback.

`apps/api` is a cloud HTTP API for identity, organizations, and team-scoped
projections; `apps/console` is its Next.js client. Neither is currently a
daemon relay.

## Decision

1. All daemon clients are colocated with the daemon and connect over
   loopback only: the unix domain socket or named pipe for the CLI, Electron
   IPC forwarding for the desktop renderer, and the `127.0.0.1` WebSocket
   for browser-class clients.
2. No daemon listener binds a non-loopback interface. Remote control from
   outside the machine is out of scope until a future ADR covers relay
   topology, non-local authentication, transport security, and per-client
   identity together.
3. `apps/api` remains a cloud API for identity and team projections, not a
   daemon relay. `apps/console` remains its client and is separate from any
   future browser client of the daemon.
4. Authentication stays token-based: the token is read from local daemon
   metadata and every loopback transport shares it.
5. Provider OAuth login flows complete on the local machine (loopback
   callback or OS deep link), because the client and the daemon are always
   on the same host. No remote callback URL is needed.

## Consequences

- Daemon-owned absolute paths remain valid for every client, since the
  client host and the daemon host are the same machine. A remote path
  semantics pass is deferred with the relay decision.
- Event sequence numbers, reconnect catch-up, and idempotent mutations are
  still required: loopback connections drop on daemon restarts and client
  reloads.
- Provider and agent configuration writes move into the daemon so non-Electron
  local clients (CLI, browser) can manage them; only flows that are
  inherently host-capabilities stay in Electron.
- A future relay is additive: loopback transport, token auth, and daemon RPC
  contracts remain unchanged underneath it.
