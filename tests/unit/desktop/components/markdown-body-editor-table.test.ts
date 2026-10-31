import {
  getNoteDocSchema,
  parseNoteMarkdown,
  serializeNoteMarkdown,
} from "@cocurdex/note-doc";
import { type Command, EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  clearTableSlice,
  deleteTableSlice,
  duplicateTableSlice,
  exitTable,
  insertTableSlice,
  moveTableSlice,
  selectedTableRange,
  selectTableSlice,
  setTableColumnAlign,
  sortTableByColumn,
  type TableTarget,
  trimTrailingEmptySlices,
} from "@/components/markdown-body-editor/table/table-commands";
import {
  dropTargetIndex,
  moveBlock,
  parseTabularText,
  sortedOrder,
  tabularRowsToHtml,
} from "@/components/markdown-body-editor/table/table-grid";

const FRUIT = [
  "| name | qty |",
  "| --- | --- |",
  "| pear | 10 |",
  "| apple | 2 |",
  "| fig |  |",
].join("\n");

function stateOf(markdown: string): EditorState {
  const schema = getNoteDocSchema();
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON(parseNoteMarkdown(markdown)),
  });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  const applied = command(state, (tr) => {
    next = state.apply(tr);
  });
  expect(applied).toBe(true);
  return next;
}

function grid(state: EditorState): string[][] {
  const table = state.doc.firstChild;
  if (!table) return [];
  const rows: string[][] = [];
  table.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(cell.textContent);
    });
    rows.push(cells);
  });
  return rows;
}

function headerFlags(state: EditorState): boolean[] {
  const flags: boolean[] = [];
  state.doc.firstChild?.forEach((row) => {
    flags.push(row.firstChild?.type.name === "tableHeader");
  });
  return flags;
}

const markdownOf = (state: EditorState) =>
  serializeNoteMarkdown(state.doc.toJSON());

const rows = (from: number, to = from): TableTarget => ({
  tablePos: 0,
  axis: "row",
  range: { from, to },
});
const columns = (from: number, to = from): TableTarget => ({
  tablePos: 0,
  axis: "column",
  range: { from, to },
});

describe("table grid helpers", () => {
  it("moves a block so it starts at the target index", () => {
    expect(moveBlock(["a", "b", "c", "d"], { from: 1, to: 2 }, 0)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(moveBlock(["a", "b", "c", "d"], { from: 0, to: 0 }, 3)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("maps a drop boundary to a target start index", () => {
    expect(dropTargetIndex({ from: 1, to: 1 }, 1)).toBeNull();
    expect(dropTargetIndex({ from: 1, to: 1 }, 2)).toBeNull();
    expect(dropTargetIndex({ from: 1, to: 1 }, 4)).toBe(3);
    expect(dropTargetIndex({ from: 2, to: 3 }, 0)).toBe(0);
  });

  it("sorts naturally and keeps empty values last in both directions", () => {
    const keys = ["item 10", "", "item 2", "Apple"];
    expect(sortedOrder(keys, "asc")).toEqual([3, 2, 0, 1]);
    expect(sortedOrder(keys, "desc")).toEqual([0, 2, 3, 1]);
  });

  it("parses spreadsheet clipboard text with quoted cells", () => {
    expect(parseTabularText('a\tb\r\n"x\ny"\t"say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x\ny", 'say "hi"'],
    ]);
  });

  it("rejects text that is not a rectangular grid", () => {
    expect(parseTabularText("just a line")).toBeNull();
    expect(parseTabularText("a\tb\nc")).toBeNull();
    expect(parseTabularText("single\ncolumn")).toBeNull();
  });

  it("renders rows as an escaped HTML table", () => {
    expect(tabularRowsToHtml([["<b>", "x"]], true)).toBe(
      "<table><tbody><tr><th><p>&lt;b&gt;</p></th><th><p>x</p></th></tr></tbody></table>",
    );
  });
});

describe("table commands", () => {
  it("moves a body row above the header and keeps one header row", () => {
    const next = run(stateOf(FRUIT), moveTableSlice(rows(2), 0));

    expect(grid(next).map((row) => row[0])).toEqual([
      "apple",
      "name",
      "pear",
      "fig",
    ]);
    expect(headerFlags(next)).toEqual([true, false, false, false]);
  });

  it("moves a column with its alignment", () => {
    const aligned = run(
      stateOf(FRUIT),
      setTableColumnAlign(columns(1), "right"),
    );
    const next = run(aligned, moveTableSlice(columns(1), 0));

    expect(grid(next)[0]).toEqual(["qty", "name"]);
    expect(markdownOf(next)).toMatch(/\| -+: \| -+ \|/);
  });

  it("inserts empty rows below the header as body rows", () => {
    const next = run(stateOf(FRUIT), insertTableSlice(0, "row", 1, 2));

    expect(grid(next).map((row) => row[0])).toEqual([
      "name",
      "",
      "",
      "pear",
      "apple",
      "fig",
    ]);
    expect(headerFlags(next)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("inserting above the header promotes the new row to header", () => {
    const next = run(stateOf(FRUIT), insertTableSlice(0, "row", 0));

    expect(grid(next)[0]).toEqual(["", ""]);
    expect(headerFlags(next).slice(0, 2)).toEqual([true, false]);
  });

  it("inserts a column at an index", () => {
    const next = run(stateOf(FRUIT), insertTableSlice(0, "column", 1));

    expect(grid(next)[1]).toEqual(["pear", "", "10"]);
  });

  it("duplicates the header row as a body row", () => {
    const next = run(stateOf(FRUIT), duplicateTableSlice(rows(0)));

    expect(grid(next).map((row) => row[0])).toEqual([
      "name",
      "name",
      "pear",
      "apple",
      "fig",
    ]);
    expect(headerFlags(next).slice(0, 2)).toEqual([true, false]);
  });

  it("duplicates a column range after itself", () => {
    const next = run(stateOf(FRUIT), duplicateTableSlice(columns(0, 1)));

    expect(grid(next)[1]).toEqual(["pear", "10", "pear", "10"]);
  });

  it("deleting the header row promotes the next row", () => {
    const next = run(stateOf(FRUIT), deleteTableSlice(rows(0)));

    expect(grid(next)[0]).toEqual(["pear", "10"]);
    expect(headerFlags(next)).toEqual([true, false, false]);
  });

  it("deleting every column removes the table", () => {
    const next = run(
      stateOf(`${FRUIT}\n\nafter`),
      deleteTableSlice(columns(0, 1)),
    );

    expect(markdownOf(next).trim()).toBe("after");
  });

  it("clears a column but keeps its cells", () => {
    const next = run(stateOf(FRUIT), clearTableSlice(columns(1)));

    expect(grid(next).map((row) => row[1])).toEqual(["", "", "", ""]);
    expect(grid(next).map((row) => row[0])).toEqual([
      "name",
      "pear",
      "apple",
      "fig",
    ]);
  });

  it("sorts body rows by a column and leaves the header in place", () => {
    const ascending = run(stateOf(FRUIT), sortTableByColumn(0, 1, "asc"));
    const descending = run(stateOf(FRUIT), sortTableByColumn(0, 0, "desc"));

    expect(grid(ascending).map((row) => row[0])).toEqual([
      "name",
      "apple",
      "pear",
      "fig",
    ]);
    expect(grid(descending).map((row) => row[0])).toEqual([
      "name",
      "pear",
      "fig",
      "apple",
    ]);
  });

  it("does not sort a table that is already in order", () => {
    const sorted = run(stateOf(FRUIT), sortTableByColumn(0, 1, "asc"));

    expect(sortTableByColumn(0, 1, "asc")(sorted)).toBe(false);
  });

  it("trims only trailing empty rows", () => {
    const grown = run(stateOf(FRUIT), insertTableSlice(0, "row", 4, 2));
    const trimmed = run(grown, trimTrailingEmptySlices(0, "row", 5));

    expect(grid(trimmed).map((row) => row[0])).toEqual([
      "name",
      "pear",
      "apple",
      "fig",
    ]);
  });

  it("selects whole rows and reports the selected range", () => {
    const next = run(stateOf(FRUIT), selectTableSlice(rows(1, 2)));

    expect(selectedTableRange(next, 0, "row")).toEqual({ from: 1, to: 2 });
    expect(selectedTableRange(next, 0, "column")).toBeNull();
  });

  it("exits the table into a new paragraph below it", () => {
    const state = run(stateOf(FRUIT), selectTableSlice(rows(1)));
    const next = run(state, exitTable);

    expect(next.doc.childCount).toBe(2);
    expect(next.selection.$from.parent.type.name).toBe("paragraph");
    expect(next.selection.$from.before()).toBe(next.doc.firstChild?.nodeSize);
  });
});
