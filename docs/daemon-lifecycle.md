# Daemon ownership and startup recovery

A data directory has one daemon owner. Ownership is independent of the runtime
fingerprint and wire protocol version. All launchers must enter through
`packages/daemon/src/wire.ts` and `startDaemonServer`.

## Lifetime

1. Create and resolve the data directory, then acquire an exclusive transaction
   on `daemon-owner.sqlite` using `daemon-ownership.ts`.
2. Probe the canonical endpoint before touching the product database. A live
   endpoint prevents startup; only ENOENT or ECONNREFUSED allows stale endpoint
   recovery. Other failures, including timeout, abort startup.
3. Bind the listener. On Unix, bind a private name and publish its inode with an
   exclusive hard link to the canonical name; then remove the private name.
   Windows uses its named pipe directly. Requests remain gated during recovery.
4. Initialize the service and complete the one-time session, tool-call and chat
   recovery. `bootstrap()` reads current state and never repeats recovery.
5. Enable requests and publish metadata using a same-directory atomic rename.
6. On shutdown or failed startup, close connections and the service, clean up
   owned endpoint and metadata, and release ownership last.

## Ownership invariants

- Never delete, rotate, migrate or replace `daemon-owner.sqlite`. Its stable file
  identity is the lock. It is separate from `cocurdex.sqlite`, so product writes
  and pre-release schema recreation do not release ownership.
- Keep the ownership connection open throughout service shutdown and endpoint
  cleanup. A failed contender must not initialize service state.
- SQLite releases the transaction when its connection closes; the operating
  system also releases process locks after a crash. There is no stale-age or PID
  takeover rule. See [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
  and [SQLite locking](https://www.sqlite.org/lockingv3.html).
- Unix close unlinks the private bind name, not a successor's canonical name.
  Explicit canonical cleanup checks device and inode identity. Metadata cleanup
  checks PID, token and start time.
- The protocol assumes cooperating launchers and a local data filesystem with
  functioning SQLite locks. A pre-existing live endpoint is still rejected even
  if its process predates the ownership lock. Concurrent old launchers that do
  not follow this protocol are outside the new mutual-exclusion guarantee.

## Verification

Run `pnpm --filter @cocurdex/daemon test`. Focused coverage lives in
`daemon-ownership.test.ts`, `daemon-endpoint.test.ts`, `wire.test.ts` and
`startup-recovery.test.ts` under `packages/daemon/src`.

The tests cover cross-process exclusion, forced process termination, independent
profiles, concurrent startup, failed publication cleanup, endpoint replacement,
probe uncertainty, repeat bootstrap, and recovery without a bootstrap client.
## Transports

The wire protocol is newline-delimited JSON over the canonical Unix socket or
Windows named pipe. `packages/rpc/src/client.ts` owns the transport-neutral
client: request identity, timeouts, abort, subscription handshake and error
mapping. `createSocketTransport` in `packages/daemon/src/client.ts` and
`createWebSocketTransport` in the rpc package adapt it to local sockets and
WebSocket connections respectively.

`startDaemonServer({ webSocketPort })`, or `COCURDEX_DAEMON_WS_PORT` for the
executable, additionally listens on `127.0.0.1` with one JSON message per
WebSocket frame and the same token check. Browser `Origin` values other than
loopback or `file:` are rejected at handshake. Malformed frames close that
connection and do not shut down the process. The resolved URL is published as
`webSocketUrl` in the daemon metadata. The listener is loopback only; remote
access needs authentication and transport security beyond the local token.

## Request and subscription lifetime

`client.ts` bounds requests from connection establishment through response. Errors,
peer closure, local abort and timeout settle once and destroy the connection.
`client-timeout.ts` defines method budgets: health checks are short, ordinary RPCs
use 30 seconds, Git commit message generation and `git.commit` allow 2 minutes,
`git.push` allows 10 minutes, and worktree setup/create/remove allow 15 minutes
to accommodate the existing 10-minute lifecycle scripts. A timed-out mutation
has an unknown outcome; the client must not retry it automatically. Callers can
provide a positive timeout.
Subscription deadlines apply only to the handshake, not the established stream.

Timeout or disconnect does not prove that a mutation failed. The client does not
retry mutations automatically and does not cancel accepted daemon work. Callers
may instead attach an `idempotencyKey` to a request: `rpc-receipts.ts` coalesces
in-flight duplicates and replays the stored outcome (result or error) for
repeated keys within its retention window, so a client that reconnects after an
ambiguous outcome can resend the same keyed request without double execution.
Receipts are in-memory and scoped to the daemon lifetime; they are not a
persistent audit log.

Every daemon event is journaled with a monotonically increasing sequence number
by `event-journal.ts`, bounded to a fixed capacity. `daemon.subscribe` accepts
`afterSeq`: the server replays journaled entries after that sequence before the
subscription goes live, and the rpc client buffers events that arrive before the
handshake resolves. `DaemonEventSubscription.lastSeq` exposes the latest
observed sequence for a resubscribe attempt. Sequences reset when the daemon
restarts, so clients must not deduplicate across lifetimes; desktop reconnect
still broadcasts `chat:invalidated` for a full state refresh.

Desktop subscription ownership lives in `daemon-event-connection.ts`: concurrent
connection attempts are merged; reset, disposal and disconnection invalidate the
generation before closing resources, and resubscribes pass the recorded
`lastSeq` as `afterSeq`. Late events, close callbacks and handshake results from
an older generation cannot replace the current subscription.

## Safe runtime replacement

`daemon.shutdownIfIdle` carries the PID and start time from the observed status.
The daemon rejects a stale identity. `DaemonShutdownGate` synchronously checks
in-flight product RPCs alongside agent turns, queued inputs, chat operations and
workflow scheduler activity. A busy result leaves the daemon usable. An accepted
result closes admission before yielding, sends the response and tears down the
server; the executable then exits. Work remains counted after a client times out.

The desktop uses this protocol for automatic replacement and explicit restart;
it does not signal an unverified PID. A compatible busy runtime continues serving
and is reconsidered after two seconds. An incompatible busy runtime, unsupported
shutdown method, or uncertain status causes an error without forceful replacement.
A running older build without this method must be closed normally before upgrading.
Normal application disposal retains its existing owned-process shutdown behavior.

Regression coverage additionally includes `client-transport.test.ts`,
`daemon-shutdown-gate.test.ts`, `daemon-shutdown-rpc.test.ts`, and the desktop
`daemon-event-connection.test.ts` / `daemon-runtime-client.test.ts` suites.
