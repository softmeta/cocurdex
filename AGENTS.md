# Cocurdex

## Working principles

- Use English for code, documentation, and commit messages.
- Prioritize macOS, then Windows, then Linux in design, implementation, verification, and debugging.
- Before the first stable release, fix root causes in the design, data model, API, or control flow. Remove obsolete paths; add compatibility layers only when explicitly requested.
- Prefer the latest stable dependencies. Use prerelease or deprecated versions only when explicitly requested or required for compatibility.
- Verify current information, versions, API behavior, platform limits, troubleshooting, configuration, and third-party tooling against official documentation, repositories, release notes, or standards before drawing conclusions or changing code. Prefer current official sources when sources conflict and explain the choice. If verification is unavailable, state the uncertainty and limit conclusions to local evidence. Verify advice with cost, risk, or long-term maintenance implications.

## Git and branches

Never change code or commit on `main`. Create a branch before the first edit or commit. If work has already landed on `main`, move it to a branch with `git branch <name>`, `git checkout <name>`, then `git branch -f main <original-commit>`, leaving the working tree untouched. Never push to `main` or rewrite its history.

When the checkout is already on a branch other than `main`, reuse that branch instead of creating or switching to a new one. Switching branches interrupts other tasks sharing the checkout, and a shared worktree cannot check out the same branch twice. Only create or switch branches when explicitly asked.

Land changes through a branch and a pull request: push, open the PR, watch its checks and review threads, then merge with `gh pr merge --merge`. Clear every review thread first — fix it, or reply with a reason and then resolve it. Docs, skills, and tooling changes take this path with no version bump and no tag; only an explicit release request bumps `apps/desktop/package.json` and pushes a `v<version>` tag. See `.agents/skills/desktop-release`.

## Architecture: daemon, host, and clients

Reusable product capabilities belong in `packages/daemon`, exposed through `@cocurdex/rpc`. Ask: would a browser client need this capability through the daemon? If yes, use daemon RPC; desktop-only host APIs use Electron IPC.

| Layer | Responsibilities |
| --- | --- |
| Daemon | Sessions, worktrees, notes, issues, workflows, providers, agent roles, product settings, permissions, plan approvals, headless workspace Git/filesystem operations, and all persistence. SQLite is owned exclusively by the daemon. |
| Shared contracts | Types and invariants in `@cocurdex/shared`; named product RPC methods in `@cocurdex/rpc`. Do not add product behavior to `storage.call`. |
| Electron host (`apps/desktop/electron`) | Windows, menus, native dialogs, system appearance/fonts, protocols, BrowserView, PTY, file watching that requires `BrowserWindow`, updates, and thin daemon forwarding. Forwarding handlers only validate and call `requestDaemon(...)`. |
| Clients (renderer, CLI, future web/mobile) | UI and navigation orchestration; read and write product state through daemon contracts. No duplicate business protocols or client-owned product policies. |

Capabilities needed by the CLI must not exist only in IPC. When modifying IPC that contains product logic, move that logic into the daemon instead of extending it there.

## Data compatibility

Persisted user data outlives any single release. Never delete, recreate, or rewrite a database because the application version changed.

- Migrate `cocurdex.sqlite` forward in `packages/db/src/migrations.ts`. Every schema change bumps `CURRENT_SCHEMA_VERSION` and adds a step to `MIGRATION_STEPS` that preserves existing rows.
- Keep migrations additive or value-preserving. Add and backfill columns instead of renaming or dropping columns that hold user data; a rename copies the old values into the new column before the old one is removed.
- Treat persisted JSON columns (`provider_snapshot_json`, `attachments_json`, `origin_json`, workflow artifacts) as versioned data: read old shapes, and change them additively or migrate the stored values in the same release.
- Keep `getDefaultUserDataPath()` and `DATABASE_FILENAME` stable. A new channel, build flavor, or rename must not move where an installed app reads its existing data.
- Recreate only a file without the `COCU` application marker, and move it aside as a `.bak-<timestamp>` file first. Refuse a database written by a newer schema version; never downgrade or delete it.
- Opening a database that needs a migration writes a `cocurdex.sqlite.pre-migration-<timestamp>` snapshot and keeps the newest three.
- Cover each migration with a test that seeds the previous schema, migrates, and asserts that sessions, workspaces, messages, notes, and issues survive.

## Verification and tests

After edits, run applicable checks in this order and fix reported issues:

1. For new `t("...")` calls, run `pnpm --filter @cocurdex/desktop i18n:extract`, complete en-US and zh-CN translations, then run `pnpm --filter @cocurdex/desktop i18n:types` and `pnpm exec biome check --write apps/desktop/src/i18n` (biome normalizes the generated `.d.ts`; CI fails on stale output). `src/locales/*.json` and `src/i18n/*.generated.d.ts` are generated artifacts: resolve merge conflicts by rerunning this chain, never by hand-editing them.
2. Run the affected packages' TypeScript checks, scoped to changed TypeScript source files.
3. Run `pnpm exec biome check --write <changed-files>` for supported files. For Markdown-only changes, run `git diff --check`; no TypeScript check is needed.

Use TDD for critical pure functions and similarly stable logic. UI, feature flows, and rapidly changing behavior do not require TDD; add valuable regression coverage when behavior stabilizes.

- Test important business semantics, algorithms, state transitions, protocol/persistence boundaries, and high-risk regressions, not coverage numbers.
- Avoid testing implementation details such as classes, DOM nesting, indexes, internal call order, trivial string assembly, or pass-through getters unless they express an explicit visual, accessibility, or protocol contract.
- Import tested modules directly and mock real boundaries, not broad barrels or large objects. Avoid unrelated module initialization; do not export internals solely for tests.
- Do not write tests that grep source text for the presence or absence of strings, imports, or constructs (logging lines, `useEffect`, file layout), or that assert on incidental implementation text. These tests break on harmless refactors while protecting no observable behavior; enforce the intent with a lint rule, review, or a behavior-level test instead.
- Rewrite or remove brittle tests that break during routine refactoring or UI/copy changes without protecting important behavior. Do not distort production code to preserve them.

`tests/e2e` (`pnpm --filter @cocurdex/e2e test`) runs deterministic process-level e2e: it spawns the real daemon binary and CLI against an isolated `COCURDEX_USER_DATA_PATH`, then drives production clients over the real socket. `desktop-smoke.test.ts` additionally launches the built Electron app (`pnpm --filter @cocurdex/desktop exec electron-vite build` first) and verifies the window, the spawned daemon, and a clean renderer; it skips when `out/` is absent. Keep e2e free of LLM providers, network, keychain, and UI assertions.

Startup performance has a baseline. CI fails when the renderer's startup chunks exceed `apps/desktop/startup-budget.json` (`pnpm --filter @cocurdex/desktop check:startup-bundle` after a build) or when desktop code imports `lazy`/`Suspense` from `react`. Raise the budget with `check:startup-bundle --update` only for intended growth, and justify it in the PR. When a change touches startup (entry imports, app shell, bootstrap, main-process `whenReady`), compare `pnpm --filter @cocurdex/desktop perf:startup` on builds before and after; add `--onboarding` for the first-run screen. Reference on Apple Silicon (2026-09-30): returning user FCP about 70–90 ms and LCP about 100 ms.

## Development and UI verification

Do not start `pnpm --filter @cocurdex/desktop dev`; ask the user to start it if needed. Do not reuse processes, open browsers, or click through the app unless the user explicitly requests it.

You may attach to a running desktop app over Chrome DevTools Protocol yourself to debug, without asking first: read the renderer console, evaluate JavaScript, inspect the DOM, measure layout, and take screenshots. For simple verification you may start `pnpm --filter @cocurdex/desktop dev:inspect` (or set `COCURDEX_REMOTE_DEBUGGING_PORT` on `dev`) yourself when no debuggable app is running; treat the session as read-only unless the user asks for interaction. Keep the attach disposable: detach when the investigation is done, and never leave the app in a modified state.

When the running app is occupied by another session, start an additional instance instead of competing for it. Each instance needs a unique `COCURDEX_REMOTE_DEBUGGING_PORT` and a unique `COCURDEX_USER_DATA_PATH` — the single-instance lock and the daemon socket are scoped to the userData profile, so a second instance on the same profile exits immediately. Reuse the already-running renderer dev server through `ELECTRON_RENDERER_URL` rather than a second `electron-vite dev`; `cdp.mjs launch` in the debug-desktop skill automates this. Run at most 5 concurrent debug instances, and kill only the ones you started.

Prefer measuring over guessing. When a symptom involves rendering, layout, timing, or third-party behavior and a CDP session can answer it, attach and measure before proposing a cause or a fix; state the measurement that settled it. Do not stack hypotheses, batch speculative fixes, or ask the user to re-verify round after round when the running app can be inspected directly.

The user verifies UI/UX changes locally. After implementation and required checks, briefly state what changed and which screen to inspect. Diagnose runtime errors, console exceptions, and reproducible functional failures through code, logs, and a CDP session; visual acceptance is not an agent requirement.

## Code structure and imports

- Keep feature-specific components, hooks, utilities, types, and fixtures together. Move shared code outward only as its reuse scope grows; cross-app reuse belongs in `packages`, not imports between apps.
- Give source folders an `index.ts` or `index.tsx` public entry that exports only what consumers need.
- Across features in `apps/desktop/src`, use `@/*`; across packages, use `@cocurdex/*` public entries. Within a feature, use short relative imports.
- Do not bypass boundaries with `packages/*/src/*`, `apps/*/src/*`, deep relative paths, or internal file imports. Add missing public exports instead.
- Avoid long lines and nested ternaries. Use named values, helpers, `if`, or lookup tables for complex branches.
- Before editing a code file over 400 lines, prefer extracting cohesive components, hooks, utilities, or fixtures unless that reduces clarity or expands scope. Markdown files are exempt.
- Do not add or expand code comments (`//`, block comments, JSX comments, or JSDoc). Express intent through naming, types, structure, and tests. Tool-required directives are the only exception.
- Desktop-specific rules (barrels, lazy loading, UI components, appearance tokens, React hooks, Fast Refresh) live in `apps/desktop/AGENTS.md`.

## Product knowledge and skills

- PRDs, specs, notes, and issues live only in the daemon-owned `cocurdex.sqlite`. Never write them into the workspace or open the database directly; use the `cocurdex` CLI.
- Use namespaced skills: `/cocurdex-grill` -> `/cocurdex-prd` -> optional `/cocurdex-spec` -> `/cocurdex-issue` -> `/cocurdex-ship`. Router: `/cocurdex-ask`; notes: `/cocurdex-note`; links: `/cocurdex-link`; parallel teammate agents: `/cocurdex-team`; app settings: `/cocurdex-settings`. Todo and ticket mean issue.
- Manage issue structure (init, list, create, move, validate) through `@cocurdex/cli` using `cocurdex issue ...`. Never invent IDs or manually rewrite status.
- Distribute skills from `packages/product-skills` through Settings > Skills or `cocurdex skills install --scope project|global`; do not auto-install. This repository symlinks `.agents/skills/cocurdex-*` and `.claude/skills/cocurdex-*` to that source; never commit installed copies.
- Product skills are part of the CLI contract. When a change adds, renames, or removes a `cocurdex` CLI command, flag, output field, or the daemon capability behind it, update the affected `packages/product-skills/skills/cocurdex-*` in the same PR. When adding a daemon capability agents should use, decide whether it needs a CLI command and skill coverage.
- Before exploring, read `CONTEXT.md` and relevant ADRs in `docs/adr/`. Use the glossary's terms, and surface any conflict with an ADR instead of silently overriding it.
