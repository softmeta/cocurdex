import type { JSONContent } from "@tiptap/core";
import { renderTableToMarkdown, Table } from "@tiptap/extension-table";

function withHeaderRow(table: JSONContent): JSONContent {
  const [first, ...rest] = table.content ?? [];
  if (!first) return table;
  const header = {
    ...first,
    content: first.content?.map((cell) => ({ ...cell, type: "tableHeader" })),
  };
  return { ...table, content: [header, ...rest] };
}

export const NoteTable = Table.extend({
  renderMarkdown: (node, helpers) =>
    renderTableToMarkdown(withHeaderRow(node), helpers),
});
