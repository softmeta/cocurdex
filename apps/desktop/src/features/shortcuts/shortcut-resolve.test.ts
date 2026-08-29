import { describe, expect, it } from "vitest";

import {
  findShortcutConflicts,
  isShortcutCustomized,
  resolveShortcutCombo,
} from "./shortcut-resolve";

describe("resolveShortcutCombo", () => {
  it("returns catalog default when no override", () => {
    expect(resolveShortcutCombo("fileSearch", {})).toEqual({
      key: "p",
      primary: true,
    });
  });

  it("returns explicit null when unbound", () => {
    expect(resolveShortcutCombo("fileSearch", { fileSearch: null })).toBe(null);
  });

  it("returns custom override", () => {
    expect(
      resolveShortcutCombo("fileSearch", {
        fileSearch: { key: "k", primary: true },
      }),
    ).toEqual({ key: "k", primary: true });
  });
});

describe("isShortcutCustomized", () => {
  it("is false for defaults", () => {
    expect(isShortcutCustomized("fileSearch", {})).toBe(false);
    expect(
      isShortcutCustomized("fileSearch", {
        fileSearch: { key: "p", primary: true },
      }),
    ).toBe(false);
  });

  it("is true for unbound or remapped", () => {
    expect(isShortcutCustomized("fileSearch", { fileSearch: null })).toBe(true);
    expect(
      isShortcutCustomized("fileSearch", {
        fileSearch: { key: "o", primary: true },
      }),
    ).toBe(true);
  });
});

describe("findShortcutConflicts", () => {
  it("flags two actions sharing a combo", () => {
    const conflicts = findShortcutConflicts({
      toggleChatDock: { key: "p", primary: true },
    });
    const chat = conflicts.find((entry) => entry.id === "toggleChatDock");
    const file = conflicts.find((entry) => entry.id === "fileSearch");
    expect(chat?.conflictsWith).toContain("fileSearch");
    expect(file?.conflictsWith).toContain("toggleChatDock");
  });

  it("ignores unbound actions", () => {
    expect(findShortcutConflicts({ fileSearch: null })).toEqual([]);
  });
});
