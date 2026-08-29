import { describe, expect, it } from "vitest";

import {
  formatShortcutLabel,
  normalizeShortcutKey,
  parseShortcutCombo,
  serializeShortcutCombo,
  shortcutCombosEqual,
} from "./shortcuts";

describe("normalizeShortcutKey", () => {
  it("maps space and lowercases", () => {
    expect(normalizeShortcutKey(" ")).toBe("space");
    expect(normalizeShortcutKey("F")).toBe("f");
    expect(normalizeShortcutKey("Enter")).toBe("enter");
  });
});

describe("shortcutCombosEqual", () => {
  it("treats missing modifiers as false", () => {
    expect(
      shortcutCombosEqual(
        { key: "j", primary: true },
        { key: "j", primary: true },
      ),
    ).toBe(true);
    expect(
      shortcutCombosEqual(
        { key: "j", primary: true },
        { key: "j", primary: true, shift: false },
      ),
    ).toBe(true);
    expect(
      shortcutCombosEqual(
        { key: "j", primary: true },
        { key: "j", primary: true, shift: true },
      ),
    ).toBe(false);
  });

  it("equates nulls only to nulls", () => {
    expect(shortcutCombosEqual(null, null)).toBe(true);
    expect(shortcutCombosEqual(null, { key: "j" })).toBe(false);
  });
});

describe("serializeShortcutCombo / parseShortcutCombo", () => {
  it("round-trips object form", () => {
    const combo = { key: "f", primary: true, shift: true };
    expect(parseShortcutCombo(combo)).toEqual({
      key: "f",
      primary: true,
      alt: false,
      shift: true,
    });
  });

  it("round-trips token form even when the key is a modifier letter", () => {
    const combo = { key: "p", primary: true, alt: true };
    const serialized = serializeShortcutCombo(combo);
    expect(serialized).toBe("cmd+opt+key:p");
    expect(parseShortcutCombo(serialized)).toEqual({
      key: "p",
      primary: true,
      alt: true,
      shift: false,
    });
  });

  it("returns null for invalid payloads", () => {
    expect(parseShortcutCombo(undefined)).toBe(null);
    expect(parseShortcutCombo("")).toBe(null);
    expect(parseShortcutCombo({ primary: true })).toBe(null);
    expect(parseShortcutCombo("cmd+opt+shift")).toBe(null);
  });
});

describe("formatShortcutLabel", () => {
  it("returns empty for unbound", () => {
    expect(formatShortcutLabel(null)).toBe("");
  });
});
