import {
  formatCommandHelp,
  groupUsageLines,
  wrapLine,
} from "@cocurdex/cli/internal/help";
import { describe, expect, it } from "vitest";

describe("groupUsageLines", () => {
  it("groups usage by command and keeps notes with the command above them", () => {
    const groups = groupUsageLines([
      "  cocurdex memory recall <query> [--json]",
      "  Account secrets are read from a hidden prompt.",
      "  cocurdex script-run list [--json]",
    ]);

    expect(groups.get("memory")).toEqual([
      "cocurdex memory recall <query> [--json]",
      "Account secrets are read from a hidden prompt.",
    ]);
    expect(groups.get("script-run")).toEqual([
      "cocurdex script-run list [--json]",
    ]);
  });
});

describe("wrapLine", () => {
  it("breaks between options, never inside a bracketed option", () => {
    const rows = wrapLine(
      "cocurdex memory remember --title <title> [--importance important|trivial] [--tags a,b]",
      60,
      "      ",
    );

    expect(rows).toEqual([
      "cocurdex memory remember --title <title>",
      "      [--importance important|trivial] [--tags a,b]",
    ]);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(60);
  });
});

describe("formatCommandHelp", () => {
  it("moves an aligned trailing note under its usage line", () => {
    const text = formatCommandHelp(
      "web",
      [
        "cocurdex web [--json]                   Print the local web client URL",
      ],
      80,
    );

    expect(text.split("\n")).toEqual([
      "Usage: cocurdex web <action> [options]",
      "",
      "  cocurdex web [--json]",
      "        Print the local web client URL",
    ]);
  });
});
