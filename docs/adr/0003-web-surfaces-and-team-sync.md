# ADR 0003: Web surfaces and team sync boundary

## Status

Accepted (2026-08-10)

## Context

Cocurdex is a desktop-first multi-agent workspace. Local product data (Notes,
Issues, search indexes, and related projections) lives in app-owned SQLite
owned exclusively by the daemon (ADR 0001).

We need three additional product surfaces:

1. A public marketing site and user documentation site where SEO and Core Web
   Vitals matter.
2. An authenticated web console where members of a team can inspect
   organization-level Issues, docs, and related team state.
3. A cloud API that backs identity, organizations, and team data, and that both
   the desktop app and the web console can call.

Packing marketing, docs, auth, and the console into one SPA (or one ungoverned
Next.js tree) would couple SEO-critical public pages to authenticated app code,
duplicate domain models between desktop and web, and blur the local SQLite
authority boundary.

## Decision

### 1. Three deployable surfaces in this monorepo

| Surface | Package | Stack (default) | Hosting intent |
|---------|---------|-----------------|----------------|
| Marketing + docs | `apps/web` (`@cocurdex/web`) | Astro + Starlight | Static (`cocurdex.com`) |
| Team console | `apps/console` (`@cocurdex/console`) | Next.js App Router | Dynamic (`app.cocurdex.com`) |
| Cloud API | `apps/api` (`@cocurdex/api`) | Fastify on portable Node (thin HTTP shell) | `api.cocurdex.com` |

- Public marketing and docs must be SSG-first. They must not depend on
  `apps/desktop`, Electron, or the local daemon.
- The console is an authenticated product surface. SEO is not a goal for
  signed-in routes.
- The API is the only cloud write path for team-scoped resources. Console and
  desktop both consume it; business rules do not live only inside Next.js route
  handlers long term.
- The API runs as a **portable Node process** (Fastify for HTTP only). Do not
  couple domain logic or deploy shape to a single cloud vendor runtime
  (Workers-only APIs, Lambda-only adapters, proprietary gateways). Clients
  depend on stable HTTP + JSON contracts, not on Fastify types.

A single Next.js app that hosts marketing, docs, and console is an explicit
fallback for extreme staffing constraints, not the default. If used, public
routes must remain statically generated and domain logic must still sit in
shared packages / `apps/api`.

### 2. Local SQLite remains the desktop write authority

- ADR 0001 still holds for on-device data: `cocurdex.sqlite` is the sole local
  writable store; the daemon is the sole local DB owner.
- Cloud storage (Postgres or equivalent) holds identity, organizations,
  memberships, and **team projections** of selected domain entities.
- The cloud database is not a second free-form writer for the same local file.
  Sync and publish flows define what crosses the boundary.

### 3. Team data model is organization-centric

- Identity is shared across desktop and web (one account system).
- Resources that appear in the team console are scoped to an **Organization**
  (or equivalent team entity) via membership and roles—not only to a user.
- Desktop workspaces may **link** to an organization before team sync or
  publish is enabled for that workspace.

### 4. Sync / publish contract before feature depth

Before shipping team Issue/doc UI, define:

1. Which entities are eligible for cloud projection (v1 likely Issues and
   published docs/notes; not full agent session transcripts by default).
2. Directionality per entity (read-only projection vs bidirectional write).
3. Conflict and revision rules (prefer explicit revision fields already used
   locally where applicable).
4. Authn/authz for desktop clients (token/device flow) vs browser sessions
   (cookie/session on `app` + `api` parent domain).

Web console v1 should favor **org-scoped list/detail and light mutations**
(status, assignee, comments) over a full editor or agent runtime in the browser.

### 5. Shared contracts, not shared UI trees

- Cross-client DTOs and API shapes extend `@cocurdex/shared` (or a dedicated
  thin contract package if shared grows product-UI-specific).
- Brand assets may be shared from `brand/`.
- `apps/web` and `apps/console` must not import `apps/desktop` source or
  renderer UI modules. Desktop must not import web/console app code.
- Design tokens may later move to a small shared package; until then, duplicate
  deliberately rather than create desktop ↔ web cycles.

### 6. Delivery phases

| Phase | Outcome |
|-------|---------|
| P0 | `apps/web` marketing + docs skeleton; static deploy |
| P1 | `apps/api` auth + org/membership skeleton; `apps/console` shell behind auth |
| P2 | Team Issue/doc projections; desktop → API sync for read paths |
| P3 | Stronger permissions, audit, billing, selective bidirectional write |

## Consequences

- SEO-critical pages stay static and independently deployable from the
  authenticated console.
- Desktop remains the primary authoring and agent surface; the console is a
  team visibility and light collaboration surface unless a later ADR changes
  that product register.
- Introducing org-scoped cloud data requires new schema and sync work; it does
  not invalidate local SQLite for offline desktop use.
- Two frontend frameworks (Astro + Next.js) are accepted operational cost in
  exchange for surface isolation. Revisit only if maintenance cost dominates.
- Cookie and CORS design for `app.` / `api.` subdomains must be specified at P1;
  desktop cannot rely on browser-only session cookies.
