import { describe, expect, it } from "vitest";
import {
  buildEntries,
  entryItemKey,
  type GitChangeEntry,
  sortEntriesInTreeOrder,
} from "@/features/editor/git-changes-model";

const order = (paths: string[]) =>
  sortEntriesInTreeOrder(paths.map((path) => ({ path }))).map(
    (entry) => entry.path,
  );

describe("sortEntriesInTreeOrder", () => {
  it("keeps the file tree's order instead of the flat git order", () => {
    expect(
      order([
        "AGENTS.md",
        "apps/desktop/src/app/layout/app-shell/app-shell.tsx",
        "apps/desktop/src/app/layout/chat-dock.tsx",
        "apps/desktop/src/app/layout/chat-window/index.ts",
      ]),
    ).toEqual([
      "apps/desktop/src/app/layout/app-shell/app-shell.tsx",
      "apps/desktop/src/app/layout/chat-window/index.ts",
      "apps/desktop/src/app/layout/chat-dock.tsx",
      "AGENTS.md",
    ]);
  });

  it("puts folders before files at every level", () => {
    expect(order(["src/a.ts", "src/api/x.ts", "src/z/y.ts"])).toEqual([
      "src/api/x.ts",
      "src/z/y.ts",
      "src/a.ts",
    ]);
  });

  it("puts dot-prefixed items first inside each group", () => {
    expect(
      order([".agents/skill.md", "apps/x.ts", "apps/.env", "README.md"]),
    ).toEqual([".agents/skill.md", "apps/.env", "apps/x.ts", "README.md"]);
  });

  it("sorts names case-insensitively", () => {
    expect(order(["apps/Beta.ts", "apps/alpha.ts", "apps/Gamma.ts"])).toEqual([
      "apps/alpha.ts",
      "apps/Beta.ts",
      "apps/Gamma.ts",
    ]);
  });

  it("orders nested folders depth first", () => {
    expect(
      order([
        "src/app/layout/sidebar/x.tsx",
        "src/app/layout/app-shell/a.ts",
        "src/app/layout/chat-dock.tsx",
      ]),
    ).toEqual([
      "src/app/layout/app-shell/a.ts",
      "src/app/layout/sidebar/x.tsx",
      "src/app/layout/chat-dock.tsx",
    ]);
  });

  it("keeps every entry", () => {
    const paths = ["b/x.ts", "a.ts", "c/y.ts"];

    expect(order(paths).toSorted()).toEqual(paths.toSorted());
  });
});

describe("entryItemKey", () => {
  const entry = (contents: string, inner = "b") =>
    buildEntries([
      {
        path: "src/a.ts",
        changeType: "modified",
        oldContents: contents,
        newContents: contents.replace(inner, inner.toUpperCase()),
        omittedReason: null,
        stagedState: "unstaged",
      },
    ])[0] as GitChangeEntry;

  const key = (item: GitChangeEntry, overrides = {}) =>
    entryItemKey(item, {
      folded: false,
      diffStyle: "unified",
      wrap: false,
      expandUnchanged: false,
      ...overrides,
    });

  it("changes when the file's contents change, so no stale height survives", () => {
    expect(key(entry("a\nb\nc"))).not.toBe(key(entry("a\nb\nc\nd")));
  });

  it("keeps the same key while the contents are unchanged", () => {
    expect(key(entry("a\nb\nc"))).toBe(key(entry("a\nb\nc")));
  });

  it("changes with fold and display options", () => {
    const item = entry("a\nb\nc");

    expect(key(item)).not.toBe(key(item, { folded: true }));
    expect(key(item)).not.toBe(key(item, { diffStyle: "split" }));
    expect(key(item)).not.toBe(key(item, { wrap: true }));
    expect(key(item)).not.toBe(key(item, { expandUnchanged: true }));
  });
});
