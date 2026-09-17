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

1. For new `t("...")` calls, run `pnpm --filter @cocurdex/desktop i18n:extract`, complete en-US and zh-CN translations, then run `pnpm --filter @cocurdex/desktop i18n:types`.
2. Run the affected packages' TypeScript checks, scoped to changed TypeScript source files.
3. Run `pnpm exec biome check --write <changed-files>` for supported files. For Markdown-only changes, run `git diff --check`; no TypeScript check is needed.

Use TDD for critical pure functions and similarly stable logic. UI, feature flows, and rapidly changing behavior do not require TDD; add valuable regression coverage when behavior stabilizes.

- Test important business semantics, algorithms, state transitions, protocol/persistence boundaries, and high-risk regressions, not coverage numbers.
- Avoid testing implementation details such as classes, DOM nesting, indexes, internal call order, trivial string assembly, or pass-through getters unless they express an explicit visual, accessibility, or protocol contract.
- Import tested modules directly and mock real boundaries, not broad barrels or large objects. Avoid unrelated module initialization; do not export internals solely for tests.
- Do not write tests that grep source text for the presence or absence of strings, imports, or constructs (logging lines, `useEffect`, file layout), or that assert on incidental implementation text. These tests break on harmless refactors while protecting no observable behavior; enforce the intent with a lint rule, review, or a behavior-level test instead.
- Rewrite or remove brittle tests that break during routine refactoring or UI/copy changes without protecting important behavior. Do not distort production code to preserve them.

`tests/e2e` (`pnpm --filter @cocurdex/e2e test`) runs deterministic process-level e2e: it spawns the real daemon binary and CLI against an isolated `COCURDEX_USER_DATA_PATH`, then drives production clients over the real socket. `desktop-smoke.test.ts` additionally launches the built Electron app (`pnpm --filter @cocurdex/desktop exec electron-vite build` first) and verifies the window, the spawned daemon, and a clean renderer; it skips when `out/` is absent. Keep e2e free of LLM providers, network, keychain, and UI assertions.

## Development and UI verification

Do not start `pnpm --filter @cocurdex/desktop dev`; ask the user to start it if needed. Do not reuse processes, attach CDP, open browsers, take screenshots, or click through the app to verify appearance or interaction unless the user explicitly requests UI inspection.

The user verifies UI/UX changes locally. After implementation and required checks, briefly state what changed and which screen to inspect. Diagnose runtime errors, console exceptions, and reproducible functional failures through code and logs; visual acceptance is not an agent requirement.

## Code structure and imports

- Keep feature-specific components, hooks, utilities, types, and fixtures together. Move shared code outward only as its reuse scope grows; cross-app reuse belongs in `packages`, not imports between apps.
- Give source folders an `index.ts` or `index.tsx` public entry that exports only what consumers need.
- Across features in `apps/desktop/src`, use `@/*`; across packages, use `@cocurdex/*` public entries. Within a feature, use short relative imports.
- Do not bypass boundaries with `packages/*/src/*`, `apps/*/src/*`, deep relative paths, or internal file imports. Add missing public exports instead.
- Avoid long lines and nested ternaries. Use named values, helpers, `if`, or lookup tables for complex branches.
- Before editing a code file over 400 lines, prefer extracting cohesive components, hooks, utilities, or fixtures unless that reduces clarity or expands scope. Markdown files are exempt.
- Do not add or expand code comments (`//`, block comments, JSX comments, or JSDoc). Express intent through naming, types, structure, and tests. Tool-required directives are the only exception.

### Public entries, heavy dependencies, and cycles

Barrels are external interfaces, never an internal bus. Files within the same domain, including siblings exported by one barrel, import each other directly with relative paths.

- Prefer named re-exports; use `export *` sparingly. Keep executable code, side effects, initialization, tests, stories, and CSS out of barrels. Main, preload, and renderer must not share a barrel.
- Keep heavy editors, terminals, diff/tree renderers, highlighters, charts, and PDF dependencies out of broad barrels. Use feature subentries such as `@/components/markdown-body-editor`.
- For UI-gated heavy components, expose a feature-local `*-lazy.tsx` wrapper using `lazy` and `Suspense`. Split lightweight constants and pure functions from heavy modules before exporting them.
- Keep heavy modules out of startup calls. Invert dependencies through events and subscribe after the heavy module loads; see `lib/theme-events.ts`. Verify entry chunk size rather than guessing.
- Move cross-feature coordination into `app/layout` instead of creating bidirectional feature imports. Run `pnpm --filter @cocurdex/desktop lint:cycles` when changing dependency structure and fix new cycles. Only structural recursion may be considered for `ALLOWED_CYCLES` in `scripts/check-cycles.mjs`, with a recorded rationale.

## UI components and consistency

Reuse installed shadcn/ui components before writing equivalent controls, menus, dialogs, forms, or feedback. Check `apps/desktop/src/components/ui` first; consider adding missing components through the shadcn CLI. Custom UI is appropriate only when no suitable component exists, composition reduces clarity, or the component is specific to the product.

| Layer | Purpose |
| --- | --- |
| `components/ui/` | shadcn primitives; avoid direct edits and never add product logic. |
| `components/app/` | App-wide wrappers for consistent APIs, defaults, and option contracts; export through `components/index.ts` and consume via `@/components` or `@/components/app`. |
| `components/chat/`, `features/*` | Domain-specific compositions, including Markdown and chat shells. |

Prefer semantic tokens, CSS mappings, wrappers, small caller styles, and composition before editing primitives. Edit `components/ui` only for upstream/accessibility fixes, missing extension points, or upstream API changes. Keep such edits minimal and reversible; explain in the PR why a wrapper is insufficient. Do not copy entire primitives or scatter caller patches to avoid editing them.

- Keep colors, interaction states, dimensions, spacing, icons, typography, radii, and shadows consistent across equivalent controls, panels, routes, and float/pinned modes. Encapsulate necessary product exceptions and explain them in the PR.
- Reuse components for repeated structure, styling, and behavior. Maintain row/column alignment, stable header heights, continuous dividers, and aligned hit areas during sidebar toggles, pinning, expansion, and state changes.
- Reuse `EmptyState` and `Spinner` for empty/loading feedback. Set dialog size through `DialogContent`'s `size` (`default`, `compact`, `wide`), without caller overrides for width, padding, or radius.
- Support RTL with logical layout, spacing, positioning, corners, icon direction, and text alignment. Use physical `left`/`right` only when the behavior is physically directional.
- Prefer `lucide-react`. Use explicit, consistent `size-3.5`, `size-4`, or `size-5` within a row or context. Conditionally render status icons; do not reserve them with `opacity-0`.

### Appearance tokens

Use Tailwind for layout and project semantic tokens for appearance in feature UI and app wrappers. Layout, positioning, dimensions, and spacing utilities are allowed; do not invent tokens for ordinary spacing.

- Use `Text` (`size="meta|body|display|..."`) or named project typography. Do not add arbitrary pixel text sizes or Tailwind text-size scales such as `text-xs`, `text-sm`, or `text-base`.
- Use semantic colors such as `bg-background`, `text-muted-foreground`, and chat/editor surface tokens, not arbitrary palette colors.
- Use semantic radii below, not Tailwind radius scales or arbitrary pixel radii. Add a semantic token for a necessary new design value.

| Radius token | Value | Use |
| --- | --- | --- |
| `rounded-micro` | 2px | Checkboxes, tooltip arrows, fine chrome |
| `rounded-dense` | 4px | Dense glyphs, keyboard hints, tiny icon targets |
| `rounded-control` | 6px | Controls, list rows, menu items, select triggers |
| `rounded-card` | 12px | Cards, raised surfaces, wrapper dropdowns |
| `rounded-panel` | 14px | Dialogs, large panels, message shells |
| `rounded-overlay` | 20px | Command palettes, large overlays |
| `rounded-full` | Circle | Avatars, status dots, pills |
| `rounded-none` | 0 | Joined edges, flush chrome |

`theme-tailwind.css` defines these radii. Primitives may retain shadcn classes mapped to semantic values: `sm -> dense`, `md/lg -> control`, `xl -> card`, `2xl -> panel`, `3xl/4xl -> overlay`. Directional radius classes may retain these mapped scales.

### Selectors

Do not build another value selector with `Popover + Command`, `CommandItem + AppDropdownCheck`, or feature-local Combobox composition.

| Scenario | Component |
| --- | --- |
| Searchable single selection | `AppSearchableSelect` (wraps `components/ui/combobox`) |
| Short, non-searchable single selection | `AppSelect` / `SettingsSelect` (wraps `components/ui/select`) |
| Single selection inside a mixed action menu | `AppDropdownRadioList` |
| Command palette or editor `@` / `/` completion | `Command` or existing mention/slash menus |
| Inline table/list filtering | `Input` |

Extend `AppSearchableSelect` or `AppSelect` props first. Extend primitives only when their upstream capabilities are insufficient, and expose changes through app wrappers. Direct Select/Combobox trigger and content/list composition belongs only in `components/app`.

### Searchable class names

- Write complete literal class strings so classes copied from DevTools can be found in source. Do not split tokens with concatenation or template strings.
- Use `cn` for conditions: one complete static base string, followed by conditional classes. Avoid ternaries in `className` and splitting the static base across arguments.
- Extract repeated structure, styles, and behavior into components, not class-string constants. For DOM string generation or third-party overrides, prefer functions or components; explain any necessary exception outside code comments.
- Split components when class lists make lines unwieldy; do not sacrifice searchability by splitting strings.

## React hooks and effects

- Call hooks only at the top level of function components or custom hooks, before early returns; never inside conditions, loops, callbacks, event handlers, or classes. Put conditional behavior inside the hook.
- Keep `react` and `react-dom` versions aligned, use one React instance, and enable Biome's `useHookAtTopLevel` rule.
- Effects are only for synchronizing external systems such as DOM, network, timers, subscriptions, browser APIs, or non-React components. Before adding `useEffect`, explain the external system and why render calculations, event handlers, stable `key` resets, lifted state, or memoization cannot replace it.
- Derive values during render; use `useMemo` only for measured expensive computations. Avoid mirrored state, effect chains, and effect-based parent notifications. Handle user actions and related state updates in their originating event; use controlled components or lifted state when appropriate.

References: [Rules of Hooks](https://react.dev/warnings/invalid-hook-call-warning), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), and Tailwind CSS's *Styling with utility classes - Managing duplication*.

## Product knowledge and skills

- PRDs, specs, notes, and issues are private in app-owned storage by default. Publish to workspace `.cocurdex/` only on explicit user request. See `docs/agents/issue-tracker.md` and `docs/agents/cocurdex-layout.md`.
- Use namespaced skills: `/cocurdex-grill` -> `/cocurdex-prd` -> optional `/cocurdex-spec` -> `/cocurdex-issue` -> `/cocurdex-ship`. Router: `/cocurdex-ask`; notes: `/cocurdex-note`; links: `/cocurdex-link`; parallel teammate agents: `/cocurdex-team`. Todo and ticket mean issue in the selected private or explicitly published pool.
- Manage issue structure (init, list, create, move, validate) through `@cocurdex/cli` using `cocurdex issue ...`. Never invent IDs or manually rewrite status.
- Distribute skills from `packages/product-skills` through Settings > Skills or `cocurdex skills install --scope project|global`; do not auto-install.
- Use the single-context domain documentation layout described in `docs/agents/domain.md`.
