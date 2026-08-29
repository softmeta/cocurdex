# Desktop i18n and Localization Workflow

> Status: Planned | Date: 2026-04-30
> Goal: Add a complete localization workflow for the desktop app, starting with
> English and Simplified Chinese.

---

## 1. Summary

The desktop app should use `i18next` and `react-i18next` for runtime
translation, with `i18next-cli` handling extraction, locale syncing, linting,
and type generation.

Start with two supported locales:

- `en-US`
- `zh-CN`

Expose the language preference as:

- `system`
- `en-US`
- `zh-CN`

Persist the selected mode in `localStorage`, matching the existing theme mode
preference. Keep localization scoped to product UI. Do not translate user
messages, assistant messages, file names, command output, logs, or historical
session titles that were already created by users.

## 2. Why This Fits the Current Codebase

The app is an Electron + Vite + React renderer with mostly static UI strings
inside `apps/desktop/src`. There is no existing i18n layer or locale catalog.

The current preference model is lightweight:

- Theme mode is stored in `localStorage`.
- Last selected agent is stored in `localStorage`.
- SQLite stores app data such as workspaces, sessions, messages, and editor
  views.

Language is a UI preference, not durable product data, so it should use the
same `localStorage` pattern instead of adding a database migration.

The current copy is mixed between English and Chinese, especially in settings,
session creation, sidebar actions, search, chat/tool-call UI, and editor panel
labels. Moving those strings into catalogs will make the source language
consistent and prevent further mixed UI.

## 3. Implementation Plan

### 3.1 Runtime dependencies

Add runtime dependencies to `@cocurdex/desktop`:

- `i18next`
- `react-i18next`

Add the localization workflow dependency:

- `i18next-cli`

Use `i18next` because it has broad React support, current TypeScript guidance,
namespaces for growth, and an official CLI for extraction, sync, linting, and
type generation.

### 3.2 Renderer setup

Add `apps/desktop/src/i18n/` with:

- i18n initialization
- supported locale definitions
- language mode helpers
- locale resolution from `navigator.languages`
- `localStorage` persistence helpers
- generated type declarations from the CLI

Recommended defaults:

- `fallbackLng: "en-US"`
- `supportedLngs: ["en-US", "zh-CN"]`
- `defaultNS: "common"`
- `interpolation.escapeValue: false`, because React already escapes rendered
  values

Wrap the renderer root in `I18nextProvider` in `apps/desktop/src/main.tsx`.

When the active language changes:

- call `i18n.changeLanguage(resolvedLocale)`
- persist the selected language mode
- set `document.documentElement.lang`
- keep `document.documentElement.dir = "ltr"` for both initial locales

If language mode is `system`, listen for browser language preference changes.
This is a valid `useEffect` because it synchronizes with an external browser
API.

### 3.3 Locale catalog shape

Add locale catalogs under:

- `apps/desktop/src/locales/en-US/`
- `apps/desktop/src/locales/zh-CN/`

Use feature namespaces:

- `common`
- `settings`
- `sessions`
- `chat`
- `editor`
- `browser`
- `search`

Use stable semantic keys instead of English sentence keys. Examples:

- `settings.appearance.displayMode.title`
- `settings.appearance.displayMode.description`
- `sessions.newSession.openFolder`
- `search.palette.placeholder`
- `chat.toolCalls.status.completed`

Use interpolation for dynamic UI strings:

- `sessions.newSession.title`: `New {{agentName}} session`
- `editor.tabs.closeFile`: `Close file {{fileName}}`
- `chat.toolCalls.count`: pluralized call count

Use `<Trans>` only for strings that need embedded React elements. Most existing
strings should use `t(...)`.

### 3.4 Settings integration

Add a language row in Settings, preferably in the `general` section:

- title: Language
- options: System, English, 简体中文

Reuse the existing settings layout and toggle/select controls. The language
selector should update UI immediately without restarting the app.

Keep theme and language preference code separate, but mirror the theme helper
style for consistency.

### 3.5 Extraction and validation workflow

Add package scripts for localization:

- `i18n:extract`
- `i18n:sync`
- `i18n:lint`
- `i18n:types`

Configure `i18next-cli` to scan:

- `apps/desktop/src/**/*.{ts,tsx}`

Generated types should make translation keys type-safe during TypeScript
checks. If full resource typing becomes slow later, use the i18next selector
API with the optimized setting.

## 4. Translation Boundaries

Translate product-owned UI:

- buttons
- labels
- settings sections
- placeholders
- empty states
- status labels
- accessibility labels
- tool-call UI labels and summaries

Do not translate runtime/user-owned content:

- user prompts
- assistant responses
- reasoning content
- tool output
- command strings
- file paths
- branch names
- workspace names
- existing session titles
- logs

For generated default session titles, use the active locale only at creation
time. Do not rewrite old titles when the language changes.

## 5. Test Plan

Update tests that assert static visible strings or ARIA labels to use the
expected locale output.

Add focused tests for:

- default locale resolution from browser languages
- persisted language mode loading
- changing language from Settings updates visible UI
- user and assistant message content remains unchanged
- dynamic labels with interpolation, such as close-file labels and new-session
  titles
- pluralized tool-call summaries

After implementation, run the required checks in order:

```bash
pnpm --filter @cocurdex/desktop exec tsc --noEmit
pnpm exec biome check --write apps/desktop/src
```

Do not run `pnpm --filter @cocurdex/desktop dev`. Ask the user to run it manually
for desktop app verification.

## 6. Assumptions

- Initial locales are `en-US` and `zh-CN`.
- English should be the fallback locale.
- Locale preference is local UI state and should not be stored in SQLite.
- Translation keys should be semantic and stable.
- The first implementation should cover renderer UI only; Electron main process
  errors can be localized later if they become user-facing product copy.

## 7. References

- react-i18next getting started:
  <https://react.i18next.com/getting-started>
- react-i18next `Trans` guidance:
  <https://react.i18next.com/latest/trans-component>
- i18next TypeScript guidance:
  <https://www.i18next.com/overview/typescript>
- i18next configuration options:
  <https://www.i18next.com/overview/configuration-options>
- i18next CLI:
  <https://github.com/i18next/i18next-cli>
