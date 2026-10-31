---
name: cocurdex-deck-theme
description: Develop Cocurdex itself - add or change a slide deck theme (colors, fonts, decorations, section and page numbers) and verify it renders the same in the app, PDF, and PPTX. Use when editing packages/deck/src/themes or the deck renderers. Not for writing decks; that is /cocurdex-deck.
---

# Cocurdex deck themes

A theme is data: `defineTheme` in `packages/deck/src/themes/<name>.ts` sets colors,
fonts, role typography, and per-layout backgrounds, decorations, and slot
overrides. `resolveSlide` (`packages/deck/src/resolve.ts`) turns a slide plus its
theme into positioned items, and three renderers draw those items:

| Target | Code |
| --- | --- |
| App (desktop and web) | `apps/desktop/src/features/decks/slide-canvas.tsx`, `slide-geometry.ts` |
| PDF | `packages/deck/src/pdf.ts`, `pdf-paint.ts`, `line-wrap.ts` |
| PPTX | `packages/deck/src/pptx.ts`, `pptx-masters.ts`, `paint-raster.ts` |

A new decoration kind or paint option is not done until all three draw it. PPTX
puts decorations on slide masters and rasterizes gradients and patterns to PNG.

## Adding a theme

1. Write `packages/deck/src/themes/<name>.ts` with the helpers in `themes/parts.ts`
   (`rect`, `ellipse`, `pattern`, `pageNumber`, `sectionNumber`,
   `contentLayouts`), and register it in `themes/index.ts`.
2. Append the id to `DECK_THEME_IDS` in `packages/shared/src/decks.ts`. Ids are
   persisted in deck content: never rename or remove one.
3. Add `themes.<id>` to `apps/desktop/src/locales/{en-US,zh-CN}/decks.json` through
   the i18n chain in the root `AGENTS.md`.
4. List the theme with its audience in
   `packages/product-skills/skills/cocurdex-deck/SKILL.md`, and in the section
   counter list there if it uses `sectionNumber`.
5. Raise the preview count in `tests/scenarios/decks.mjs` to the new theme total.

## Design rules

- No full-height stripe or border along a slide's left edge, in any layout. Use
  short accent bars, rules, bands, or shapes. `themes.test.ts` enforces it.
- Slot text must reach WCAG contrast on every layout background (3:1 titles,
  4.5:1 body), gradient stops included. `themes.test.ts` checks every theme.
- Chapter numbers come from `sectionNumber`, which counts the deck's section
  slides. Page numbers come from `pageNumber` and never appear on the cover.
- Keep decorations clear of slot frames, and design on the 1280×720 canvas.

## Renderer pitfalls already paid for

- Do not spread optional style keys in React styles: `{ color: undefined }`
  replaces an earlier `color`. Add keys conditionally (`textEffectStyle`).
- PDFKit `continued` text misplaces mixed-font runs when centered or
  right-aligned. Aligned runs go through `wrapPieces` and are drawn piece by
  piece; keep CJK and Latin fallbacks on that path.
- PDF fonts come from the host (`packages/daemon/src/decks/pdf-fonts.ts`). Linux
  distributions install the same family in different directories; add every
  package directory, and cover it in `pdf-fonts.test.ts`.

## Verify

```bash
pnpm --filter @cocurdex/unit-deck test
pnpm --filter @cocurdex/unit-daemon exec vitest run decks
pnpm --filter @cocurdex/unit-desktop exec vitest run features/decks
node tests/scenarios/decks.mjs
```

The daemon suite renders every theme to PDF. Then compare by eye: open the Decks
view over CDP (see `debug-desktop`), screenshot each new theme's cover, section,
and content slides in light and dark app themes, and export the same deck with
`cocurdex deck export <id> --output <file>.pdf` and `.pptx`. The PDF and PPTX
must match the app's layout, fonts, and decorations; report any gap you cannot
close.
