# `@cocurdex/web`

Public **marketing site** and **product documentation** (static, SEO-first).

## Stack

- [Astro](https://astro.build/) 7 (`output: "static"`)
- [Starlight](https://starlight.astro.build/) for `/docs/*`
- `@astrojs/sitemap` + `public/robots.txt`

### `cookie` resolution

Astro 7 depends on `cookie@2` (`parseCookie`). Other workspace packages (via
express / MCP) still need `cookie@0.7`. We keep majors un-hoisted (`.npmrc`),
pin `astro>cookie` in `pnpm-workspace.yaml`, declare `cookie@2` on this package,
and alias it in `astro.config.mjs` so a parent `~/node_modules/cookie@0.7` cannot
win Node’s upward resolution during SSR builds.

## Scripts

```bash
pnpm --filter @cocurdex/web dev       # http://localhost:4321
pnpm --filter @cocurdex/web build
pnpm --filter @cocurdex/web preview
pnpm --filter @cocurdex/web typecheck
```

## Layout

| Path | Source |
| --- | --- |
| `/`, `/download/` | `src/pages/*.astro` + `MarketingLayout` |
| `/docs/*` | `src/content/docs/docs/**` (Starlight) |
| Brand marks | `public/` and `src/assets/` (copied from repo `brand/`) |

Internal engineering documents are not part of the web application or its build.

## Boundaries

- SSG only. No auth, no team console, no desktop/Electron imports.
- Do not deep-import `apps/desktop` UI or tokens.
- User-facing docs only under `src/content/docs/`.
- Do not publish monorepo `docs/adr` or desktop secrets into this pipeline.

## Deploy

The marketing site is the public static build (`dist/`). Repository-level
engineering documents are not part of this pipeline.

### Automated (recommended)

Workflow: [`.github/workflows/deploy-web.yml`](../../.github/workflows/deploy-web.yml)

1. Create a Cloudflare account and a Pages project name `cocurdex-web` (or let the first deploy create it).
2. Create an API token with **Account → Cloudflare Pages → Edit** (and read account if required).
3. In the GitHub repo → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Push to `main` / `dev` (paths under `apps/web/**`) or run **Deploy web** via `workflow_dispatch`.

CI installs only the `@cocurdex/web` workspace graph (no Electron desktop build).

### Manual

```bash
pnpm install --filter @cocurdex/web...
pnpm --filter @cocurdex/web build
# requires wrangler auth + same Cloudflare secrets/account
npx wrangler pages deploy apps/web/dist --project-name=cocurdex-web
```

### Domain

Point `cocurdex.com` at the Cloudflare Pages project. Keep `site` in `astro.config.mjs` equal to the public origin so sitemap/canonical URLs stay correct.
