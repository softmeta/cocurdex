---
name: cocurdex-deck
description: Create, revise, check, and export Cocurdex slide decks (presentations, PPT) through the CLI.
---

# Cocurdex Deck

Decks are app-owned SQLite records with stable ids, shown in the Decks panel.
Use `cocurdex deck`; do not write `.pptx` files by hand or open the SQLite
file. Export a `.pptx` (editable in PowerPoint, Keynote, WPS) or a `.pdf` only
when the user asks for a file; the format follows the output extension unless
`--format` says otherwise.

```bash
cocurdex deck list --json
cocurdex deck show <id> --json
cocurdex deck create [--title <title>] --markdown-file <path|-> [--workspace <id>] --json
cocurdex deck update <id> [--title <title>] [--markdown-file <path|-> | --content-file <path|->] [--expected-revision <n>] --json
cocurdex deck edit <id> --ops-file <path|-> [--expected-revision <n>] --json
cocurdex deck check <id> --json
cocurdex deck export <id> --output <path.pptx|path.pdf> [--format pptx|pdf] --json
cocurdex deck import <file.pptx> [--title <title>] [--workspace <id>] --json
cocurdex deck read <file.pptx> [--json]
cocurdex deck delete <id> --json
```

## Write decks as Markdown

Markdown is the fastest way to write a whole deck. The daemon compiles it into
slides with layouts; the result is ordinary deck data the person can edit.

- `---` on its own line separates slides.
- A slide with a `#` heading and only plain paragraphs is a title slide: the
  first one becomes the cover, the last one the closing slide, and any other a
  section divider. The paragraphs become its subtitle.
- A `##` heading is a content slide title. Lists (bullet, numbered, task, up to
  five levels), paragraphs, quotes, and code blocks fill the body.
- Exactly two `###` sections, with the first one right after the title, make a
  two-column slide.
- A table makes a table slide; text before or after it becomes a caption above
  it. Keep one table per slide.
- A `##` heading with no body is a title-only slide.
- A paragraph starting with `Notes:` (or `备注：`) starts the speaker notes;
  everything after it on that slide is notes, not slide content.
- Inline bold, italic, strikethrough, code, and links are kept. Markdown
  images are dropped with a warning; add pictures with `deck image` (below).

```markdown
# Q3 Review
Platform team · October 2026

---

## Highlights
- Shipped sync to all users
  - p95 latency down 38%
- Two incidents, both resolved within SLA

Notes: Open with the latency win.

---

## Plan
### Now
- Hardening
### Next
- Mobile client

---

# Thank you
Questions?
```

## Check your work

`create`, `update`, and `edit` return `{ deck, warnings, issues }`. `warnings` lists
Markdown the compiler dropped; `issues` lists problems in the result:

- `overflow`: text or a table does not fit even at the smallest font size.
  Shorten it or split the slide.
- `empty-slide`: a slide has no content.
- `unknown-slot`: content sits in a slot the slide's layout does not show.

Fix every issue before you report the deck as done. `deck show` includes the
current `issues`, and `deck check` returns them alone.

## Targeted edits with ops

`deck edit` applies a JSON array of ops in order, atomically: if one op
fails, nothing is saved. It keeps every slide and element id you do not
touch, so the person's other work survives. Read ids from `deck show --json`
(`content.slides[].id`, element `id`) or from the `target` of an issue.

```json
[
  { "op": "setText", "slideId": "<id>", "target": "slot:title", "markdown": "Q3 **Review**" },
  { "op": "setText", "slideId": "<id>", "target": "element:<element-id>", "paragraphs": [{ "runs": [{ "text": "Caption" }] }] },
  { "op": "setNotes", "slideId": "<id>", "notes": "Open with the latency win." },
  { "op": "insertSlides", "index": 2, "markdown": "## Risks\n- Latency" },
  { "op": "addSlide", "layout": "title-content", "index": 3 },
  { "op": "duplicateSlide", "slideId": "<id>" },
  { "op": "moveSlide", "slideId": "<id>", "index": 0 },
  { "op": "deleteSlide", "slideId": "<id>" },
  { "op": "setLayout", "slideId": "<id>", "layout": "two-content" },
  { "op": "setTheme", "theme": "midnight" },
  { "op": "deleteElement", "slideId": "<id>", "elementId": "<element-id>" }
]
```

- `setText` replaces one slot or free text element. Give `markdown` (inline
  marks and lists; one block per paragraph) or `paragraphs`, not both. A slot
  target must be a slot the slide's layout has.
- `insertSlides` compiles Markdown with the rules above and inserts the new
  slides; its warnings use indexes in the edited deck. `index` is clamped;
  without it, slides are appended.
- `setLayout` keeps all content: matching slots stay, a single body moves to
  the left column and two text columns merge into the body, and anything the
  new layout cannot hold becomes a free element at its old position.
- Themes set colors, fonts, backgrounds, decorations, and page numbers for
  every layout. Pick one that fits the audience:
  - General purpose: `default` (clean), `midnight` (dark), `sand` (warm),
    `forest` (green).
  - `tech`: minimal tech, for product launches and engineering reviews.
  - `editorial`: magazine serif, for research, reports, and stories.
  - `academic`: classic serif headings, for teaching and lectures.
  - `pop`: bold color blocks, for marketing and pitches.
  - `boardroom`: navy and teal, for business and consulting reports.
  - `nebula`: dark violet gradient, for AI talks and keynotes.
  - `ember`: dark warm gradient, for creative work and events.
  - `swiss`: red circle and heavy rules, for strategy and consulting.
  - `playful`: outlined shapes on dots, for classes and workshops.
  - `noir`: black and gold serif, for finance and annual reports.
  - `botanical`: organic sage shapes, for health, ESG, and nonprofits.
  - `blueprint`: grid paper and dimension lines, for engineering reviews.
  - `zen`: red sun and quiet rules, for culture, brands, and hospitality.
  - `retro`: seventies rainbow arcs, for events and lifestyle.
  - `terminal`: green-on-black shell, for developer talks and hackathons.
  - `bauhaus`: primary geometry, for design, art, and architecture.
  - `clinic`: soft teal cards, for healthcare and SaaS products.
- Section slides in `swiss`, `playful`, `noir`, `botanical`, `blueprint`,
  `zen`, `retro`, `terminal`, `bauhaus`, and `clinic` show a large chapter
  number counted from the deck's section slides, so use the `section` layout
  for chapter breaks instead of writing the number into the title.

## Images

Add a PNG or JPEG (up to 20 MB) to a slide; the daemon copies the file, so
the deck keeps working when the source file moves:

```bash
cocurdex deck image <deck-id> --slide <slide-id> --file ./chart.png --alt "Q3 latency chart" --json
cocurdex deck image <deck-id> --slide <slide-id> --file ./chart-v2.png --replace <element-id> --json
```

The result includes the new `image` (`hash`, `mimeType`, `width`, `height`)
and the deck; the picture is a free element with `kind: "image"`. A new image
is fitted inside the centre of the slide keeping its aspect ratio; move or
resize it by editing the element `frame` in content JSON. `--replace` swaps
the picture and keeps its frame. Remove one with the op
`{ "op": "deleteElement", "slideId": "<id>", "elementId": "<id>" }`. Ops and
content may only reference images already imported through `deck image`
(or the `deck.importImage` RPC); an unknown `hash` is rejected.

## Existing PowerPoint files

To read what a `.pptx` says (summaries, reviews, answering questions), run
`deck read`: it prints the slide text and speaker notes as deck Markdown, with
`---` between slides and pictures as `![alt](file)`. `--json` adds per-slide
`title`, `text` lines, and `notes`. Reading does not create a deck.

To work on a `.pptx` in Cocurdex, run `deck import`; it creates a new deck and
leaves the file untouched. Title slides, title-and-content, two-column, and
title-only slides map to deck layouts at their original positions; other
shapes become free text, table, and image elements. Charts, SmartArt, video,
and pictures other than PNG/JPEG are skipped and listed in `warnings`; tell the
user what was dropped. Fonts, colors, and backgrounds follow the deck theme,
not the source file. Run `deck check` afterwards, since imported text may not
fit the theme's sizes.

## Precise edits with JSON content

`deck show --json` returns `content`, the structured deck. To change part of a
deck without regenerating it, edit that JSON and send it back with
`--content-file`, keeping slide and element ids stable:

- `slides[]`: `{ id, layout, slots, slotFrames?, elements, notes }`.
- `layout`: `cover`, `section`, `title-content`, `two-content`,
  `title-only`, `closing`, or `blank`.
- `slots`: `title`, `subtitle`, `body`, `left`, `right`, each
  `{ kind: "text", paragraphs }` or `{ kind: "table", table }`. Only the slots
  the layout defines are shown.
- `elements[]`: free elements with an `id` and `frame`, one of
  `{ kind: "text", role, paragraphs }`, `{ kind: "table", table }`,
  `{ kind: "shape", shape, fill }`, or `{ kind: "image", image, alt? }`.
- A paragraph is `{ runs, list?: "bullet" | "number", level?, align? }`; a
  run is `{ text, bold?, italic?, underline?, strike?, code?, link?, color? }`.
- Colors are theme tokens: `text`, `muted`, `accent`, `page`, `surface`,
  `onAccent`.
- Coordinates (`slotFrames`, element `frame`) use a 1280×720 canvas.
- Fonts are sized automatically to fit; there is no font size field.

A Markdown update replaces every slide and its ids, and a content update
replaces the whole deck. Prefer `deck edit` ops for changes to a deck the
person has already worked on.

## Concurrent edits

People may edit a deck in the app while you work on it. When you send content
or ops based on an earlier `deck show`, pass its `revision` as
`--expected-revision <n>`. The write fails with "Deck was modified" when the
deck changed since then: run `deck show` again, reapply your change, and retry.
