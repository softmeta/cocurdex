import { hidePendingTableStart } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

describe("hidePendingTableStart", () => {
  it("holds back a table header until its delimiter row is complete", () => {
    expect(hidePendingTableStart("Intro\n\n| A | B |")).toBe("Intro\n");
    expect(hidePendingTableStart("Intro\n\n| A | B |\n|---|-")).toBe("Intro\n");
  });

  it("shows the table once the delimiter row ends", () => {
    const content = "Intro\n\n| A | B |\n|---|---|\n";
    expect(hidePendingTableStart(content)).toBe(content);
    const withRow = `${content}| 1 | 2`;
    expect(hidePendingTableStart(withRow)).toBe(withRow);
  });

  it("leaves pipes inside an open code fence alone", () => {
    const content = "```sh\nls\n| grep x";
    expect(hidePendingTableStart(content)).toBe(content);
  });

  it("accepts aligned and unbordered delimiter rows", () => {
    for (const delimiter of ["| :-- | :-: | --: |", "--- | ---", " |-|-| "]) {
      const content = `| A | B |\n${delimiter}\n`;
      expect(hidePendingTableStart(content)).toBe(content);
    }
  });

  it("rejects delimiter rows with text or empty cells", () => {
    for (const delimiter of ["| -- | x |", "| -- || -- |", "|"]) {
      expect(hidePendingTableStart(`| A | B |\n${delimiter}\n`)).toBe("");
    }
  });

  it("checks a hostile delimiter row in linear time", () => {
    const hostile = `| A |\n|-${" ".repeat(200_000)}x\n`;
    const started = performance.now();
    expect(hidePendingTableStart(hostile)).toBe("");
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("leaves content without a trailing table untouched", () => {
    expect(hidePendingTableStart("Plain text")).toBe("Plain text");
  });
});
