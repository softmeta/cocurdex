import { describe, expect, it } from "vitest";
import {
  buildEntries,
  COLLAPSED_ENTRY_HEIGHT,
  estimateEntryHeight,
  type GitChangeEntry,
} from "@/features/editor/git-changes-model";

const CARD_CHROME = COLLAPSED_ENTRY_HEIGHT;
const BODY_PADDING = 4;
const LINE = 20;
const SEPARATOR = 32;

function entryFor(oldContents: string, newContents: string): GitChangeEntry {
  const built = buildEntries([
    {
      path: "src/a.ts",
      changeType: "modified",
      oldContents,
      newContents,
      omittedReason: null,
      stagedState: "unstaged",
    },
  ]);
  return built[0] as GitChangeEntry;
}

function numbered(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index}`).join(
    "\n",
  );
}

function withChanges(count: number, changes: number[]): string {
  return Array.from({ length: count }, (_, index) =>
    changes.includes(index) ? `changed ${index}` : `line ${index}`,
  ).join("\n");
}

const estimated = (
  entry: GitChangeEntry,
  options: { expandUnchanged?: boolean; diffStyle?: "unified" | "split" } = {},
) =>
  estimateEntryHeight(entry, {
    collapsed: false,
    expandUnchanged: options.expandUnchanged ?? false,
    diffStyle: options.diffStyle ?? "unified",
  });

describe("estimateEntryHeight", () => {
  it("falls back to the card chrome for folded or unparsed files", () => {
    const entry = entryFor("a\nb\nc", "a\nB\nc");

    expect(
      estimateEntryHeight(entry, {
        collapsed: true,
        expandUnchanged: false,
        diffStyle: "unified",
      }),
    ).toBe(CARD_CHROME);
    expect(estimated({ ...entry, diff: null })).toBe(CARD_CHROME);
  });

  it("reserves pierre's collapsed layout instead of the whole file", () => {
    const entry = entryFor(numbered(100), withChanges(100, [50]));

    // One hunk of 10 rendered lines, a 46-line leading gap and 45 trailing
    // lines, both collapsed into a single separator row.
    expect(estimated(entry)).toBe(
      CARD_CHROME + BODY_PADDING + SEPARATOR + 10 * LINE + SEPARATOR,
    );
  });

  it("renders every line of the file when unchanged context is expanded", () => {
    const entry = entryFor(numbered(100), withChanges(100, [50]));

    expect(estimated(entry, { expandUnchanged: true })).toBe(
      CARD_CHROME + BODY_PADDING + 101 * LINE,
    );
  });

  it("counts each hunk and each gap separately", () => {
    const entry = entryFor(numbered(60), withChanges(60, [10, 40]));

    expect(estimated(entry)).toBe(
      CARD_CHROME +
        BODY_PADDING +
        (SEPARATOR + 10 * LINE) +
        (SEPARATOR + 10 * LINE) +
        SEPARATOR,
    );
  });

  it("keeps a one-line gap as a rendered line instead of a separator", () => {
    const entry = entryFor(numbered(10), withChanges(10, [5]));

    // Neither file ends with a newline, so pierre closes the hunk with a
    // marker row after its trailing context.
    expect(estimated(entry)).toBe(
      CARD_CHROME + BODY_PADDING + LINE + 10 * LINE + LINE,
    );
  });

  it("uses pierre's split line counts", () => {
    const entry = entryFor(numbered(100), withChanges(100, [50]));
    const noTrailingNewline = entryFor("a\nb\nc\nd", "a\nb\nc\nD");

    expect(estimated(entry, { diffStyle: "split" })).toBe(
      CARD_CHROME + BODY_PADDING + SEPARATOR + 9 * LINE + SEPARATOR,
    );
    expect(estimated(noTrailingNewline)).toBe(
      CARD_CHROME + BODY_PADDING + 5 * LINE + 2 * LINE,
    );
    expect(estimated(noTrailingNewline, { diffStyle: "split" })).toBe(
      CARD_CHROME + BODY_PADDING + 4 * LINE + LINE,
    );
  });

  it("does not reserve trailing context for an added file", () => {
    const entry = entryFor("", "a\nb\nc");

    expect(estimated(entry)).toBe(CARD_CHROME + BODY_PADDING + 3 * LINE + LINE);
  });

  it("estimates far less than a fully expanded file", () => {
    const entry = entryFor(numbered(400), withChanges(400, [200]));

    expect(estimated(entry)).toBeLessThan(
      estimated(entry, { expandUnchanged: true }) / 5,
    );
  });
});
