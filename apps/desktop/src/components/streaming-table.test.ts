import { describe, expect, it } from "vitest";
import { hidePendingTableStart } from "./streaming-table";

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

  it("leaves content without a trailing table untouched", () => {
    expect(hidePendingTableStart("Plain text")).toBe("Plain text");
  });
});
