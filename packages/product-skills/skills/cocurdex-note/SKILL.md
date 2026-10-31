---
name: cocurdex-note
description: Create, update, and link app-owned Cocurdex notes through the CLI, including PRDs and technical specs.
---

# Cocurdex Note

Notes are app-owned SQLite records with stable ids. Use `cocurdex note`; do not
write a parallel Markdown tree or open the SQLite file.

```bash
cocurdex note list --json
cocurdex note show <id> --json
cocurdex note create --title <title> [--body-file <path>] [--parent <id>] [--workspace <id>] --json
cocurdex note update <id> [--title <title>] [--body-file <path>] --json
cocurdex note move <id> --parent <note-id> | --root --json
cocurdex note backlinks <id> --json
cocurdex note tags [<id>] --json
```

`note list` returns summaries without bodies; each note with prose carries an
`excerpt` of its first lines, so skim it before deciding which note to `show`.

Any note can hold child pages. A child page always belongs to its top-level
page's workspace: `--workspace` applies only to top-level notes, and moving a
note under another page moves its whole subtree into that page's workspace.

If the prompt already contains an attached `<note … complete="true">` block,
treat it as the full note and do not run `cocurdex note show` for it. Use the
CLI only to change the note, or when the user asks for its current state.

PRDs and specs are ordinary notes: write the Markdown, save it with
`note create`, and update the returned id with `note update`. Pass long or
multi-line bodies with `--body-file <path>` or pipe them with `--body -`;
`--body <markdown>` is only for short single-line text.

The title is shown above the body, so start the body with its first section,
not a `# <title>` heading; a leading H1 that repeats the title is dropped.

The note body is a collaborative document; the Markdown you send is merged
into it, and the stored body comes back normalized. Use the `bodyMarkdown`
returned by the command as the current text. Supported blocks: headings,
lists, task lists, tables, images, quotes, and code. Unsupported syntax such
as raw HTML is kept as plain text.

To put a screenshot, diagram, or other image in a body, import the file and
paste the returned `markdown` (`![name](cocurdex://image/<file>)`) where it
belongs. Images live in the app, not the workspace, so they work on every
device. To look at an image a body already contains, `image locate` prints
the local `filePath`; read that file.

```bash
cocurdex image import <path.png|jpg|gif|webp> [--name <alt text>] --json
cocurdex image locate cocurdex://image/<file> --json
```

People may edit a note in the app while you work on it. When you rewrite a
body you read earlier, pass the `revision` from that `note show` as
`note update <id> --expected-revision <n>`; without it, your Markdown
replaces edits made after your read. The update fails with "Note was
modified" when the note changed since that revision: run `note show` again,
reapply your change to the new body, and retry.

Link notes with Markdown links that use stable note ids, then verify the
reverse direction with `note backlinks <target-id>`.

Every session, note, issue, and deck has a link URI, `cocurdex://<kind>/<id>`
(kind `session`, `note`, `issue`, or `deck`). A Markdown link to that URI in a
note body, such as `[COC-12](cocurdex://issue/<issue-id>)`, opens the item in
the app and shows the note as "mentioned by" on the item. To relate two items
without writing the link into a body, use the link commands; refs are
`<kind>:<id>` or the URI, and issues also accept their identifier:

```bash
cocurdex link add note:<note-id> issue:COC-12 --json
cocurdex link list note:<note-id> --json
cocurdex link remove note:<note-id> deck:<deck-id> --json
```

`link list` returns every connection of the item with its `relation`
(`related`, `mentions`, `mentioned-by`, issue relations, `parent`, `child`,
`worked-on-by`, `works-on`); only `related` links are `removable` with
`link remove`.

Markdown is the note body format at the API boundary, not an on-disk source of
truth. Publishing a note to a repository requires an explicit export flow.
