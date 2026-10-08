import type { NoteSummary } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { ancestorIds, buildVisibleNoteTree } from "./build-note-tree";
import {
  canMoveNoteTo,
  listMoveDestinations,
  resolveDropTarget,
  sectionDropId,
} from "./note-moves";
import { groupNoteSections } from "./note-sections";

function summary(
  partial: Pick<NoteSummary, "id" | "parentId"> & Partial<NoteSummary>,
): NoteSummary {
  return {
    kind: "note",
    title: partial.id,
    icon: null,
    sortOrder: 0,
    workspaceId: null,
    revision: 1,
    createdAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    ...partial,
  };
}

const notes = [
  summary({ id: "plan", parentId: null, workspaceId: "ws-a" }),
  summary({ id: "milestones", parentId: "plan", workspaceId: "ws-a" }),
  summary({ id: "m1", parentId: "milestones", workspaceId: "ws-a" }),
  summary({ id: "journal", parentId: null }),
  summary({ id: "lost", parentId: "missing" }),
];

describe("buildVisibleNoteTree", () => {
  it("nests pages under pages and hides collapsed subtrees", () => {
    expect(
      buildVisibleNoteTree(notes).map((node) => [node.note.id, node.depth]),
    ).toEqual([
      ["journal", 0],
      ["plan", 0],
      ["milestones", 1],
      ["m1", 2],
      ["lost", 0],
    ]);
    const collapsed = buildVisibleNoteTree(notes, new Set(["plan"]));
    expect(collapsed.map((node) => node.note.id)).toEqual([
      "journal",
      "plan",
      "lost",
    ]);
    expect(collapsed[1]?.hasChildren).toBe(true);
  });

  it("walks ancestors to the root", () => {
    expect(ancestorIds("m1", notes)).toEqual(["milestones", "plan"]);
  });
});

describe("groupNoteSections", () => {
  const workspaces = [
    { id: "ws-a", name: "A" },
    { id: "ws-b", name: "B" },
    { id: "ws-c", name: "C" },
  ];

  it("groups subtrees by their root's workspace, personal last", () => {
    const sections = groupNoteSections(notes, workspaces, "ws-b");
    expect(
      sections.map((section) => [
        section.workspaceId,
        section.notes.map((note) => note.id),
      ]),
    ).toEqual([
      ["ws-a", ["plan", "milestones", "m1"]],
      ["ws-b", []],
      [null, ["journal", "lost"]],
    ]);
  });

  it("puts notes of unknown workspaces into the personal section", () => {
    const sections = groupNoteSections(
      [summary({ id: "x", parentId: null, workspaceId: "gone" })],
      workspaces,
      null,
    );
    expect(sections).toEqual([
      { workspaceId: null, notes: [expect.objectContaining({ id: "x" })] },
    ]);
  });
});

describe("note moves", () => {
  it("allows any page as a parent but rejects no-ops and cycles", () => {
    expect(canMoveNoteTo(notes, "journal", { parentId: "m1" })).toBe(true);
    expect(canMoveNoteTo(notes, "m1", { parentId: "milestones" })).toBe(false);
    expect(canMoveNoteTo(notes, "plan", { parentId: "m1" })).toBe(false);
    expect(canMoveNoteTo(notes, "plan", { parentId: "plan" })).toBe(false);
  });

  it("moves a root page to another section but not its own", () => {
    const toPersonal = { parentId: null, workspaceId: null };
    expect(canMoveNoteTo(notes, "plan", toPersonal)).toBe(true);
    expect(canMoveNoteTo(notes, "journal", toPersonal)).toBe(false);
    expect(
      canMoveNoteTo(notes, "m1", { parentId: null, workspaceId: "ws-a" }),
    ).toBe(true);
  });

  it("drops onto a page as a child and onto a section as a root", () => {
    expect(resolveDropTarget(notes, "journal", "milestones")).toEqual({
      parentId: "milestones",
    });
    expect(resolveDropTarget(notes, "m1", sectionDropId(null))).toEqual({
      parentId: null,
      workspaceId: null,
    });
    expect(resolveDropTarget(notes, "plan", "m1")).toBeUndefined();
    expect(resolveDropTarget(notes, "plan", null)).toBeUndefined();
  });

  it("lists sections and non-descendant pages as destinations", () => {
    const destinations = listMoveDestinations(notes, "milestones", [
      { workspaceId: "ws-a", title: "A" },
      { workspaceId: null, title: "Personal" },
    ]);
    expect(destinations.map((destination) => destination.title)).toEqual([
      "A",
      "Personal",
      "journal",
      "lost",
    ]);
  });
});
