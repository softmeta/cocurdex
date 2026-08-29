# `@cocurdex/api`

Cloud HTTP API for identity, organizations, and team-scoped projections.

## Stack

- **Runtime:** Node.js (portable process; no cloud-vendor runtime APIs).
- **HTTP:** [Fastify](https://fastify.dev/) as a thin transport layer only.
- **Contracts:** stable HTTP + JSON; desktop and console must not import Fastify types.

Avoid plugins or SDKs that only work on one host (Workers-only, Lambda-only
adapters, proprietary gateway bindings). Prefer standard Node listen + reverse
proxy so the same binary runs locally, in a container, or on any VPS.

## Scripts

```bash
pnpm --filter @cocurdex/api dev
pnpm --filter @cocurdex/api test
pnpm --filter @cocurdex/api typecheck
```

Default listen: `127.0.0.1:8787` (`HOST` / `PORT` env overrides).

## Boundaries

- Shared DTOs: `@cocurdex/shared` (extend carefully; no UI imports).
- Does not open local `cocurdex.sqlite` (desktop daemon remains local DB owner).
- Console and desktop are clients of this API; do not embed team rules only in Next.js.
- Domain modules stay framework-agnostic so the HTTP shell can be replaced without rewriting product logic.
