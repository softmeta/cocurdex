import type { NoteSummary } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  ancestorFolderIds,
  buildVisibleNoteTree,
  canMoveNoteTo,
  listMoveDestinations,
  NOTES_ROOT_DROP_ID,
  remapNoteIdAfterMove,
  resolveDropParentId,
} from "./build-note-tree";

function summary(
  partial: Pick<NoteSummary, "id" | "parentId" | "kind"> & Partial<NoteSummary>,
): NoteSummary {
  return {
    title: partial.title ?? partial.id,
    icon: null,
    sortOrder: 0,
    workspaceId: null,
    revision: 1,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...partial,
  };
}

describe("buildVisibleNoteTree", () => {
  const tree = [
    summary({ id: "design", parentId: null, kind: "folder", title: "design" }),
    summary({
      id: "design/a.md",
      parentId: "design",
      kind: "note",
      title: "a",
    }),
    summary({
      id: "design/nested",
      parentId: "design",
      kind: "folder",
      title: "nested",
    }),
    summary({
      id: "design/nested/b.md",
      parentId: "design/nested",
      kind: "note",
      title: "b",
    }),
    summary({ id: "root.md", parentId: null, kind: "note", title: "root" }),
  ];

  it("flattens with depth and sorts siblings by title", () => {
    const nodes = buildVisibleNoteTree(tree);
    expect(nodes.map((n) => n.note.id)).toEqual([
      "design",
      "design/a.md",
      "design/nested",
      "design/nested/b.md",
      "root.md",
    ]);
    expect(nodes.map((n) => n.depth)).toEqual([0, 1, 1, 2, 0]);
    expect(nodes[0]?.hasChildren).toBe(true);
  });

  it("hides descendants of collapsed folders without orphaning them", () => {
    const nodes = buildVisibleNoteTree(tree, new Set(["design"]));
    expect(nodes.map((n) => n.note.id)).toEqual(["design", "root.md"]);
  });

  it("surfaces orphans at depth 0", () => {
    const nodes = buildVisibleNoteTree([
      summary({
        id: "ghost/child.md",
        parentId: "missing",
        kind: "note",
        title: "child",
      }),
    ]);
    expect(nodes).toEqual([
      expect.objectContaining({
        note: expect.objectContaining({ id: "ghost/child.md" }),
        depth: 0,
      }),
    ]);
  });
});

describe("ancestorFolderIds", () => {
  it("walks parent links to the root", () => {
    const summaries = [
      summary({ id: "a", parentId: null, kind: "folder" }),
      summary({ id: "a/b", parentId: "a", kind: "folder" }),
      summary({ id: "a/b/c.md", parentId: "a/b", kind: "note" }),
    ];
    expect(ancestorFolderIds("a/b/c.md", summaries)).toEqual(["a/b", "a"]);
    expect(ancestorFolderIds("a", summaries)).toEqual([]);
  });
});

describe("listMoveDestinations", () => {
  const summaries = [
    summary({ id: "a", parentId: null, kind: "folder", title: "A" }),
    summary({ id: "a/child.md", parentId: "a", kind: "note", title: "child" }),
    summary({ id: "a/sub", parentId: "a", kind: "folder", title: "Sub" }),
    summary({ id: "b", parentId: null, kind: "folder", title: "B" }),
    summary({ id: "root.md", parentId: null, kind: "note", title: "root" }),
  ];

  it("offers root and non-descendant folders, skips current parent", () => {
    const dests = listMoveDestinations(summaries, "a/child.md", "Top level");
    // Folders sorted by title: B before Sub.
    expect(dests).toEqual([
      { parentId: null, title: "Top level" },
      { parentId: "b", title: "B" },
      { parentId: "a/sub", title: "Sub" },
    ]);
  });

  it("blocks moving a folder into itself or descendants", () => {
    const dests = listMoveDestinations(summaries, "a", "Top level");
    // Already at root → no "Top level"; descendants of a are blocked.
    expect(dests.map((d) => d.parentId)).toEqual(["b"]);
  });

  it("omits root when already at root", () => {
    const dests = listMoveDestinations(summaries, "root.md", "Top level");
    expect(dests.map((d) => d.parentId)).toEqual(["a", "b", "a/sub"]);
  });
});

describe("remapNoteIdAfterMove", () => {
  it("rewrites the moved node and nested open ids", () => {
    expect(remapNoteIdAfterMove("design", "design", "docs")).toBe("docs");
    expect(remapNoteIdAfterMove("design/a.md", "design", "docs")).toBe(
      "docs/a.md",
    );
    expect(remapNoteIdAfterMove("other.md", "design", "docs")).toBe("other.md");
  });
});

describe("canMoveNoteTo / resolveDropParentId", () => {
  const summaries = [
    summary({ id: "a", parentId: null, kind: "folder", title: "A" }),
    summary({ id: "a/child.md", parentId: "a", kind: "note", title: "child" }),
    summary({ id: "a/sub", parentId: "a", kind: "folder", title: "Sub" }),
    summary({ id: "b", parentId: null, kind: "folder", title: "B" }),
    summary({ id: "root.md", parentId: null, kind: "note", title: "root" }),
  ];

  it("rejects no-ops and cycles", () => {
    expect(canMoveNoteTo(summaries, "a/child.md", "a")).toBe(false);
    expect(canMoveNoteTo(summaries, "a", "a")).toBe(false);
    expect(canMoveNoteTo(summaries, "a", "a/sub")).toBe(false);
    expect(canMoveNoteTo(summaries, "a/child.md", "b")).toBe(true);
    expect(canMoveNoteTo(summaries, "a/child.md", null)).toBe(true);
  });

  it("resolves folder, sibling, and root drop targets", () => {
    expect(resolveDropParentId(summaries, "root.md", "b")).toBe("b");
    expect(resolveDropParentId(summaries, "root.md", "a/child.md")).toBe("a");
    expect(
      resolveDropParentId(summaries, "a/child.md", NOTES_ROOT_DROP_ID),
    ).toBe(null);
    expect(resolveDropParentId(summaries, "a", "a/sub")).toBeUndefined();
    expect(
      resolveDropParentId(summaries, "root.md", "root.md"),
    ).toBeUndefined();
  });
});
