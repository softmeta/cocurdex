import {
  applyMarkdownToNoteDoc,
  applyNoteDocUpdate,
  createNoteDocState,
  decodeNoteDocBytes,
  diffNoteDoc,
  encodeNoteDocBytes,
  NOTE_DOC_FIELD,
  noteDocStateVector,
  noteDocToMarkdown,
  parseNoteMarkdown,
  serializeNoteMarkdown,
} from "@cocurdex/note-doc/internal/index";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const RICH_MARKDOWN = [
  "# Plan",
  "",
  "Ship **notes** with [spec](note://spec-id) and #roadmap.",
  "",
  "- [ ] draft",
  "- [x] review",
  "",
  "| step | owner |",
  "| --- | --- |",
  "| sync | daemon |",
  "",
  "![diagram](https://example.com/diagram.png)",
  "",
  "```ts",
  "const ready = true",
  "```",
].join("\n");

function editAsPeer(state: Uint8Array, markdown: string): Uint8Array {
  const peer = new Y.Doc();
  Y.applyUpdate(peer, state);
  const before = Y.encodeStateVector(peer);
  const { state: next } = applyMarkdownToNoteDoc(
    Y.encodeStateAsUpdate(peer),
    markdown,
  );
  Y.applyUpdate(peer, next);
  return Y.encodeStateAsUpdate(peer, before);
}

describe("note markdown", () => {
  it("round-trips tables, images, tasks, links, and code", () => {
    const markdown = serializeNoteMarkdown(parseNoteMarkdown(RICH_MARKDOWN));

    expect(markdown).toContain("| sync");
    expect(markdown).toContain("![diagram](https://example.com/diagram.png)");
    expect(markdown).toContain("- [x] review");
    expect(markdown).toContain("[spec](note://spec-id)");
    expect(markdown).toContain("const ready = true");
    expect(serializeNoteMarkdown(parseNoteMarkdown(markdown))).toBe(markdown);
  });

  it("keeps app-stored image references through the collaborative doc", () => {
    const image =
      "![checkout](cocurdex://image/3f1c2a9e-4b7d-4e2a-9c1f-0a1b2c3d4e5f.png)";
    const markdown = noteDocToMarkdown(
      createNoteDocState(`Repro:\n\n${image}\n\nSee ${image} inline.`),
    );

    expect(markdown.split(image)).toHaveLength(3);
  });

  it.each([
    ["an inline image", "Before ![chart](chart.png) after"],
    ["an image in a table cell", "| shot |\n| --- |\n| ![ui](ui.png) |"],
    ["a footnote", "Claim[^1]\n\n[^1]: Source text"],
    ["raw html", "<details><summary>More</summary>Hidden body</details>"],
  ])("keeps every word of %s", (_label, source) => {
    const words = (text: string) => text.match(/[\p{L}\p{N}]+/gu) ?? [];
    const markdown = noteDocToMarkdown(createNoteDocState(source));

    for (const word of words(source)) {
      expect(markdown).toContain(word);
    }
  });

  it("keeps formatting of convertible blocks next to a lossy one", () => {
    const markdown = noteDocToMarkdown(
      createNoteDocState("# Heading\n\nClaim[^1]\n\n[^1]: Source text"),
    );

    expect(markdown).toContain("# Heading");
    expect(markdown).toContain("Source text");
  });

  it("keeps the row count of a table without a header row", () => {
    const cell = (text: string) => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const headerless = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("name"), cell("qty")] },
            { type: "tableRow", content: [cell("apple"), cell("3")] },
          ],
        },
      ],
    };

    const markdown = serializeNoteMarkdown(headerless);
    const table = parseNoteMarkdown(markdown).content?.[0];

    expect(markdown).toContain("| name");
    expect(table?.content).toHaveLength(2);
    expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
  });

  it("keeps wikilinks readable outside code", () => {
    const markdown = serializeNoteMarkdown(
      parseNoteMarkdown("See [[Release Plan]].\n\n```\n\\[\\[raw\\]\\]\n```"),
    );

    expect(markdown).toContain("See [[Release Plan]].");
    expect(markdown).toContain("\\[\\[raw\\]\\]");
  });
});

describe("note doc state", () => {
  it("creates a doc whose markdown matches the parsed source", () => {
    const state = createNoteDocState(RICH_MARKDOWN);

    expect(noteDocToMarkdown(state)).toBe(
      serializeNoteMarkdown(parseNoteMarkdown(RICH_MARKDOWN)),
    );
  });

  it("creates an empty doc for empty markdown", () => {
    expect(noteDocToMarkdown(createNoteDocState(""))).toBe("");
  });

  it("reports no change when markdown already matches the doc", () => {
    const state = createNoteDocState(RICH_MARKDOWN);

    const result = applyMarkdownToNoteDoc(state, noteDocToMarkdown(state));

    expect(result.changed).toBe(false);
  });

  it("applies a markdown rewrite as a small incremental update", () => {
    const state = createNoteDocState(RICH_MARKDOWN);
    const rewritten = RICH_MARKDOWN.replace("Ship", "Release");

    const update = editAsPeer(state, rewritten);

    expect(update.byteLength).toBeLessThan(state.byteLength / 4);
    expect(noteDocToMarkdown(applyNoteDocUpdate(state, update).state)).toBe(
      serializeNoteMarkdown(parseNoteMarkdown(rewritten)),
    );
  });

  it("merges concurrent edits to different blocks", () => {
    const base = createNoteDocState("First line\n\nSecond line");
    const human = editAsPeer(base, "First line edited\n\nSecond line");
    const agent = editAsPeer(base, "First line\n\nSecond line edited");

    const merged = applyNoteDocUpdate(
      applyNoteDocUpdate(base, human).state,
      agent,
    );

    expect(merged.markdown).toBe("First line edited\n\nSecond line edited");
    expect(merged.changed).toBe(true);
  });

  it("persists an update that only deletes content", () => {
    const base = createNoteDocState("Keep this typo");
    const deletion = editAsPeer(base, "Keep this");

    const result = applyNoteDocUpdate(base, deletion);

    expect(result.changed).toBe(true);
    expect(noteDocToMarkdown(result.state)).toBe("Keep this");
  });

  it("persists a markdown rewrite that only deletes content", () => {
    const base = createNoteDocState("First\n\nSecond");

    const result = applyMarkdownToNoteDoc(base, "First");

    expect(result.changed).toBe(true);
    expect(noteDocToMarkdown(result.state)).toBe("First");
  });

  it("ignores an update that was already applied", () => {
    const base = createNoteDocState("Hello");
    const update = editAsPeer(base, "Hello world");
    const once = applyNoteDocUpdate(base, update);

    const twice = applyNoteDocUpdate(once.state, update);

    expect(twice.changed).toBe(false);
    expect(twice.markdown).toBe("Hello world");
  });

  it("diffs against a client state vector", () => {
    const base = createNoteDocState("Hello");
    const client = new Y.Doc();
    Y.applyUpdate(client, base);
    const server = applyMarkdownToNoteDoc(base, "Hello from the agent").state;

    Y.applyUpdate(client, diffNoteDoc(server, Y.encodeStateVector(client)));

    expect(noteDocToMarkdown(Y.encodeStateAsUpdate(client))).toBe(
      "Hello from the agent",
    );
    expect(noteDocStateVector(server)).toEqual(Y.encodeStateVector(client));
  });

  it("stores content in the field the editor binds to", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, createNoteDocState("Bound"));

    expect(doc.getXmlFragment(NOTE_DOC_FIELD).length).toBe(1);
  });
});

describe("note doc bytes", () => {
  it("round-trips through the base64 wire format", () => {
    const state = createNoteDocState("Wire");

    expect(decodeNoteDocBytes(encodeNoteDocBytes(state))).toEqual(state);
  });
});
