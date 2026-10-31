import {
  noteSections,
  parentNoteChoices,
} from "@cocurdex/mobile/internal/notes/note-sections";
import type { NoteSummary, WorkspaceRecord } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const now = "2026-10-25T00:00:00.000Z";

function workspace(id: string): WorkspaceRecord {
  return {
    id,
    name: id,
    rootPaths: [`/synthetic/${id}`],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder: 0,
  };
}

function note(
  id: string,
  workspaceId: string | null,
  extra: Partial<NoteSummary> = {},
): NoteSummary {
  return {
    id,
    parentId: null,
    workspaceId,
    kind: "note",
    title: id,
    icon: null,
    sortOrder: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const notes = [
  note("checkout-prd", "shop", { sortOrder: 1 }),
  note("coupon-rules", "shop", { parentId: "checkout-prd", sortOrder: 2 }),
  note("member-price", "shop", { parentId: "checkout-prd", sortOrder: 1 }),
  note("release-notes", "shop", { sortOrder: 2 }),
  note("weekly", null),
  note("orphan", "removed-workspace"),
];

describe("noteSections", () => {
  it("groups notes by workspace as an indented tree", () => {
    const sections = noteSections(notes, [workspace("shop")], "");

    expect(
      sections.map((section) => [
        section.workspace?.id ?? null,
        section.rows.map((row) => `${row.depth}:${row.note.id}`),
      ]),
    ).toEqual([
      [
        "shop",
        [
          "0:checkout-prd",
          "1:member-price",
          "1:coupon-rules",
          "0:release-notes",
        ],
      ],
      [null, ["0:orphan", "0:weekly"]],
    ]);
  });

  it("lists matching notes flat while searching", () => {
    const sections = noteSections(notes, [workspace("shop")], "COUPON");

    expect(
      sections.map((section) =>
        section.rows.map((row) => `${row.depth}:${row.note.id}`),
      ),
    ).toEqual([["0:coupon-rules"]]);
  });
});

describe("parentNoteChoices", () => {
  it("offers notes in the same workspace except the note and its descendants", () => {
    const tree = [
      ...notes,
      note("coupon-edge-cases", "shop", { parentId: "coupon-rules" }),
    ];

    expect(
      parentNoteChoices(tree, "coupon-rules").map((choice) => choice.id),
    ).toEqual(["checkout-prd", "member-price", "release-notes"]);
  });

  it("offers notes without a workspace for a note without one", () => {
    expect(
      parentNoteChoices(notes, "weekly").map((choice) => choice.id),
    ).toEqual([]);
    expect(
      parentNoteChoices([...notes, note("draft", null)], "draft").map(
        (choice) => choice.id,
      ),
    ).toEqual(["weekly"]);
  });
});
