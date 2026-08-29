# Open-Sourcing the Cocurdex Protocol and Daemon

> Status: Exploratory feasibility assessment
>
> Date: 2026-08-13
>
> No implementation or licensing decision is approved by this document.

## Executive Summary

Open-sourcing the Cocurdex protocol and daemon is feasible and could create a
valuable ecosystem around Cocurdex's local-first multi-agent runtime. The
recommended approach is staged:

1. Publish a narrow, versioned control protocol and reference client first.
2. Refactor and harden the daemon behind that protocol.
3. Publish the daemon core with optional provider adapters.
4. Keep the Desktop experience, cloud services, team features, billing, and
   brand assets outside the initial open-source scope.

The current implementation is a strong starting point, but it should not be
published as a stable public platform without preparation. The RPC package
currently exposes roughly 60 methods, imports many product DTOs from
`@cocurdex/shared`, and includes a generic `storage.call` escape hatch. The
daemon also assumes trusted local clients more strongly than a public protocol
should.

This is primarily an interface-design and product-platform task, not a rewrite.
The existing daemon ownership model, adapter seam, CLI client, and local
transport can be retained.

## Strategic Rationale

Potential benefits include:

- Improve trust in Cocurdex's local data and workspace access model.
- Allow third parties to build clients, automation, adapters, and IDE
  integrations.
- Position Cocurdex as a local multi-agent runtime instead of only an Electron
  application.
- Reduce lock-in concerns while keeping the best integrated experience in the
  official Desktop application.
- Concentrate protocol and runtime contributions in reusable modules.
- Make security, lifecycle, persistence, and cross-platform behavior easier to
  audit.

The commercial moat can remain in the official Desktop experience, cloud sync,
team collaboration, hosted infrastructure, enterprise controls, and product
design. Open-sourcing the runtime does not require open-sourcing every Cocurdex
surface.

## Goals

- Define a stable interface for controlling a local Cocurdex daemon.
- Preserve daemon ownership of local SQLite state and business invariants.
- Support official and third-party clients without direct database access.
- Make provider integrations replaceable through explicit adapter seams.
- Keep protocol compatibility, security, and lifecycle behavior testable.
- Support macOS first, Windows second, and Linux third.

## Non-Goals

- Making the SQLite schema a supported public interface.
- Publishing the Desktop renderer or product design system initially.
- Publishing cloud sync, organization, billing, or hosted-service code.
- Replacing ACP or MCP with a Cocurdex-specific protocol.
- Guaranteeing backward compatibility for the current internal RPC surface.
- Supporting arbitrary remote network access in the first release.

## Current Architecture

### Local ownership

ADR 0001 establishes that:

- `cocurdex.sqlite` is the sole writable source of truth for app-owned data.
- The daemon is the sole database owner.
- Desktop, CLI, and future integrations use daemon contracts.
- SQLite tables and the database file remain private implementation details.

Open-sourcing the database implementation would not change this decision. A
public implementation can still have an intentionally private and unstable
schema. Consumers should depend on daemon contracts rather than tables.

### RPC and transport

The current RPC implementation has these useful foundations:

- Typed request and result maps in `packages/rpc`.
- Local Unix socket or Windows named-pipe transport.
- Newline-delimited JSON framing.
- A per-daemon authentication token stored in daemon metadata.
- Request/response correlation IDs.
- A long-lived daemon event subscription.
- Protocol version and runtime fingerprint metadata.
- A typed TypeScript client used by Desktop and CLI.

The current interface also has constraints that matter for publication:

- Approximately 60 methods span daemon, app, agent, workspace, session,
  attention, storage, Notes, Issues, search, workflow, interaction, and provider
  domains.
- The RPC package imports many DTOs from `@cocurdex/shared`, so it is not an
  independently publishable contract package yet.
- `storage.call` accepts an operation string and `unknown[]`, exposing a broad
  internal dispatch surface.
- Runtime request validation is limited; TypeScript types do not protect the
  daemon from malformed third-party messages.
- The transport has no explicit maximum frame size.
- The client does not perform an explicit initialization and capability
  negotiation exchange.
- Errors are too coarse for a stable third-party client interface.

### Daemon modules

The daemon already contains real, useful seams:

- `AgentRuntimeManager` can accept an adapter factory.
- Persistence is daemon-owned and concentrated in `DaemonState` and `@cocurdex/db`.
- Workflow execution has internal interfaces and adapters.
- Desktop and CLI already exercise the daemon across the same transport seam.

However, the composition root currently imports the complete provider adapter
package, and the largest daemon modules coordinate many product domains. Before
publication, their external interface should become smaller even if the
implementation remains internally complex. The goal is a deep daemon module:
high leverage for clients through a narrow interface, with implementation
locality inside the daemon.

## Protocol Responsibilities

Three protocol roles must remain distinct:

| Role | Responsibility |
|------|----------------|
| Cocurdex Control Protocol | Workspaces, sessions, permissions, workflows, and app-owned data operations |
| ACP | Communication with compatible coding-agent processes |
| MCP | Tool, resource, prompt, and related extension capabilities |

The Cocurdex Control Protocol should orchestrate product runtime behavior. It
should not duplicate ACP's agent-process interface or MCP's extension model.

## Proposed Open-Source Shape

```text
Private or commercial surfaces
  Official Desktop UI
  Cloud sync and team services
  Billing and enterprise controls
  Brand assets and hosted infrastructure

Open-source surfaces
  @cocurdex/protocol
    Versioned wire types
    Runtime schemas
    Capability definitions
    Protocol specification

  @cocurdex/client
    Typed TypeScript client
    Connection and discovery logic
    Event subscription

  @cocurdex/daemon-core
    Session and interaction runtime
    Workflow runtime
    Local process lifecycle
    Persistence ports

  @cocurdex/daemon
    Composition root
    Local transport adapter
    SQLite adapter

  Provider adapters
    ACP
    Codex
    Pi
    OpenCode
    Grok Build
    Claude Agent SDK, distributed with separate terms
```

The exact package split is illustrative. Packages should be introduced only
where they create a real seam. Internal helpers should remain internal instead
of becoming public merely because open-source tests need them.

## Required Preparation

### 1. Extract a narrow protocol package

Create a protocol module that does not depend on the full product `shared`
package. It should own only wire-visible DTOs and invariants.

Required properties:

- Runtime schemas for every request, response, and event.
- Generated or directly inferred TypeScript types.
- Stable error codes with optional structured error data.
- Explicit nullability and forward-compatible optional fields.
- A documented compatibility policy.
- Protocol conformance fixtures that can be consumed by other languages.

### 2. Replace `storage.call`

Remove the generic storage dispatch method from the public interface. Replace
each supported operation with a typed domain method. Operations needed only by
the official Desktop application should either receive a proper contract or
remain behind a private local interface.

The database remains an implementation detail. A method should describe a
product operation, not mirror a repository method or SQL table.

### 3. Add initialization and capability negotiation

The first client request should establish:

- Protocol version range.
- Client name and version.
- Supported capabilities.
- Authentication context.
- Optional experimental capabilities.
- Server version and runtime fingerprint.

Capabilities should be used for additive feature discovery. They should not
become a substitute for protocol versioning.

### 4. Harden the wire implementation

Before accepting third-party clients, add:

- Invalid JSON and invalid-request isolation without daemon termination.
- Maximum frame and buffered-message sizes.
- Runtime validation before dispatch.
- Request timeouts and cancellation behavior where applicable.
- Stable errors for unknown methods, invalid parameters, conflicts, and
  unavailable capabilities.
- Socket and metadata permission verification.
- Token rotation and stale metadata handling.
- Redaction rules for logs and returned errors.
- Subscription backpressure and slow-client behavior.
- A documented local threat model.

The first public release should remain local-only. Remote TCP or HTTP access
would require a separate authentication, authorization, TLS, origin, and
multi-tenant threat model.

### 5. Deepen the daemon modules

Move orchestration behind a smaller external interface while keeping useful
internal seams:

- Inject provider adapter creation instead of importing all adapters into the
  daemon core.
- Keep SQLite behind persistence interfaces owned by the relevant daemon
  modules.
- Separate session runtime, app-owned data, workflow runtime, and provider
  management internally.
- Keep cross-domain coordination in the daemon composition root.
- Test observable behavior through the daemon interface rather than exporting
  internal helpers.

### 6. Separate provider adapters and terms

Provider adapters should be independently distributable and auditable. Each
adapter needs:

- Its own runtime dependencies and license inventory.
- A documented provider authentication model.
- Capability discovery rather than hard-coded assumptions where possible.
- Focused contract tests against the agent runtime seam.
- Clear ownership of subprocesses, cleanup, permissions, and persisted provider
  session identifiers.

The Claude Agent SDK currently uses Anthropic Commercial Terms rather than a
standard open-source package license. That adapter should not determine the
license or distributability of daemon core.

## Licensing Options

### Recommended default: Apache-2.0

Use Apache-2.0 for the protocol, client, and daemon core if the primary goal is
ecosystem adoption. It permits commercial use and includes an explicit patent
license. The official Desktop and cloud services can remain private.

This option makes it easier for IDE vendors, tool authors, and enterprise users
to integrate Cocurdex. It also permits competitors to reuse the daemon, so the
product moat must remain above the runtime layer.

### Alternative: AGPL-3.0 for daemon core

AGPL-3.0 can be considered if preventing closed hosted derivatives is more
important than broad embedding. The protocol and client could remain under a
permissive license.

Trade-offs include lower enterprise adoption, more license review, and more
friction for applications that embed or modify the daemon.

### Source-available licenses

If the intended license restricts competitive use, fields of use, or
redistribution, the project should be described as source available rather
than open source. The terminology should be decided before public
announcement.

### Release hygiene

Before publication:

- Add root and package license declarations.
- Add a third-party notices file where required.
- Generate a dependency license inventory and SBOM.
- Audit copied or reconstructed source separately.
- Define contribution terms and whether a CLA or DCO is needed.
- Obtain legal review for non-standard provider dependencies and trademarks.

## Compatibility Policy

The current integer `DAEMON_PROTOCOL_VERSION` is sufficient for an internal
bundle-replacement check but not for a public ecosystem by itself.

A public policy should define:

- A precise public interface.
- Semantic versions for released packages.
- A protocol version or version range negotiated during initialization.
- Additive changes allowed within a compatible protocol version.
- The removal and deprecation process.
- A support window for old clients.
- Whether experimental methods have compatibility guarantees.
- Database migration guarantees, which are separate from wire compatibility.

The runtime fingerprint should continue to identify an exact implementation
build, but clients should not use it as the primary compatibility mechanism.

## Testing and Release Gates

The public interface should be the primary test surface.

Minimum release gates:

- Protocol schema fixtures for valid and invalid messages.
- Client/daemon conformance tests.
- Compatibility tests across the supported client and daemon version matrix.
- Event ordering, reconnect, cancellation, and backpressure tests.
- Authentication and malformed-input tests.
- SQLite restart, migration, corruption, and concurrency tests.
- Provider adapter contract tests with local fakes where possible.
- Process-tree cleanup tests.
- macOS Unix-socket integration tests.
- Windows named-pipe and process-tree tests on a real Windows runner.
- Linux smoke tests after macOS and Windows behavior is established.

Tests should assert observable outcomes through the public interface. Existing
tests that only protect internal call order should not be promoted into the
public conformance suite.

## Suggested Delivery Phases

| Phase | Outcome | Rough effort |
|-------|---------|--------------|
| P0 | Scope, naming, license intent, and threat model | Several days |
| P1 | Extracted protocol package, schemas, client, and conformance fixtures | 1-2 engineering weeks |
| P2 | Typed domain methods, wire hardening, initialization, and compatibility policy | 2-4 engineering weeks |
| P3 | Daemon module deepening and optional provider adapters | 2-4 engineering weeks |
| P4 | Public repository, documentation, CI matrix, security and contribution policy | 1-2 engineering weeks |

Some phases can overlap. Community support, legal review, release automation,
and long-term compatibility maintenance are ongoing costs rather than one-time
implementation tasks.

## Main Risks

| Risk | Consequence | Mitigation |
|------|-------------|------------|
| Public interface freezes internal product decisions | Slower iteration | Publish a narrow interface and keep experimental methods explicitly unstable |
| Database schema becomes a de facto contract | Migration constraints | Require clients to use daemon contracts; never document tables as integration points |
| Provider terms contaminate distribution expectations | Packaging or legal problems | Publish adapters independently with explicit terms |
| Local token is treated as full authorization forever | Unsafe third-party clients | Add method scopes and a documented local threat model |
| Protocol duplicates ACP or MCP | Ecosystem confusion | Keep control, agent-process, and extension responsibilities separate |
| Forks commoditize the daemon | Reduced runtime differentiation | Keep the official experience, cloud, team features, and brand above the open layer |
| Compatibility support grows without limits | Maintenance burden | Define support windows and a deprecation policy before 1.0 |

## Decisions Required Before Implementation

1. Is the primary goal ecosystem adoption, trust, adapter contributions, or
   protection against hosted competitors?
2. Is the public object a protocol specification, a reusable daemon, or both?
3. Which product domains belong in the first public protocol version?
4. Should Notes and Issues be public protocol domains at launch, or should the
   first version focus only on agents, sessions, permissions, and workflows?
5. Is third-party local client access unrestricted after token discovery, or
   should clients receive explicit grants?
6. Which provider adapters can be distributed under standard open-source
   terms?
7. Does Cocurdex want an Apache-2.0 ecosystem or an AGPL-style reciprocal
   daemon?
8. What compatibility window can the project realistically maintain before
   1.0 and after 1.0?

## Recommendation

Proceed, but begin with a public protocol preview rather than publishing the
current daemon package unchanged.

The first milestone should prove that an external client can initialize,
discover capabilities, create or observe a session, handle interactions, and
subscribe to events without importing Desktop code or depending on SQLite
details. Once that interface is narrow, validated, and covered by conformance
tests, publishing the daemon becomes a controlled packaging and modularity
task instead of an irreversible exposure of internal implementation details.

## References

- [ADR 0001: App-owned SQLite data](../adr/0001-app-owned-sqlite-data.md)
- [ADR 0003: Web surfaces and team sync boundary](../adr/0003-web-surfaces-and-team-sync.md)
- [`@cocurdex/rpc` interface](../../packages/rpc/src/index.ts)
- [Daemon wire implementation](../../packages/daemon/src/wire.ts)
- [Daemon request handler](../../packages/daemon/src/handler.ts)
- [Daemon runtime](../../packages/daemon/src/runtime.ts)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [The Open Source Definition](https://opensource.org/osd)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.html)
- [GNU Affero General Public License 3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- [Anthropic Claude Agent SDK TypeScript repository](https://github.com/anthropics/claude-agent-sdk-typescript)
