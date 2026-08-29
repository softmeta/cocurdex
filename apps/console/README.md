# `@cocurdex/console`

Authenticated team console (Issues, docs, org settings).

## Scripts

```bash
pnpm --filter @cocurdex/console dev
pnpm --filter @cocurdex/console build
pnpm --filter @cocurdex/console typecheck
```

## Boundaries

- Not for SEO. Signed-in product UI only (`robots: noindex` by default).
- Talk to `@cocurdex/api` for cloud data; do not open local SQLite.
- Do not import `apps/desktop` renderer modules.
- Share contracts via `@cocurdex/shared`.

## Next steps

1. Auth session + org membership against `@cocurdex/api`.
2. Org-scoped Issue list/detail (projection from sync).
3. Align cookie domain with `app.cocurdex.com` / `api.cocurdex.com`.
