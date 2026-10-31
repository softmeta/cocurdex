export interface IndexRange {
  from: number;
  to: number;
}

export function moveBlock<T>(
  items: readonly T[],
  range: IndexRange,
  target: number,
): T[] {
  const block = items.slice(range.from, range.to + 1);
  const rest = [...items.slice(0, range.from), ...items.slice(range.to + 1)];
  const at = Math.max(0, Math.min(target, rest.length));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

export function dropTargetIndex(
  range: IndexRange,
  boundary: number,
): number | null {
  if (boundary >= range.from && boundary <= range.to + 1) return null;
  return boundary > range.to
    ? boundary - (range.to - range.from + 1)
    : boundary;
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export type SortDirection = "asc" | "desc";

export function sortedOrder(
  keys: readonly string[],
  direction: SortDirection,
): number[] {
  const sign = direction === "asc" ? 1 : -1;
  return keys
    .map((key, index) => ({ key: key.trim(), index }))
    .sort((a, b) => {
      if (!a.key || !b.key) return Number(!a.key) - Number(!b.key);
      return sign * collator.compare(a.key, b.key);
    })
    .map((entry) => entry.index);
}

function splitDelimitedRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let index = 0;
  let atFieldStart = true;
  while (index < text.length) {
    const char = text[index];
    if (atFieldStart && char === '"') {
      const close = readQuotedField(text, index + 1);
      if (close) {
        field = close.value;
        index = close.end;
        atFieldStart = false;
        continue;
      }
    }
    atFieldStart = false;
    if (char === "\t") {
      row.push(field);
      field = "";
      atFieldStart = true;
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      atFieldStart = true;
    } else {
      field += char;
    }
    index += 1;
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readQuotedField(
  text: string,
  start: number,
): { value: string; end: number } | null {
  let value = "";
  let index = start;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      if (text[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      const next = text[index + 1];
      if (next === undefined || next === "\t" || next === "\n") {
        return { value, end: index + 1 };
      }
      return null;
    }
    value += char;
    index += 1;
  }
  return null;
}

export function parseTabularText(text: string): string[][] | null {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!normalized.includes("\t")) return null;
  const rows = splitDelimitedRecords(normalized);
  const width = rows[0]?.length ?? 0;
  if (width < 2 || rows.some((row) => row.length !== width)) return null;
  return rows;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellHtml(text: string, tag: "th" | "td"): string {
  const lines = text.split("\n").map(escapeHtml).join("<br>");
  return `<${tag}><p>${lines}</p></${tag}>`;
}

export function tabularRowsToHtml(
  rows: readonly string[][],
  withHeaderRow: boolean,
): string {
  const body = rows
    .map((row, index) => {
      const tag = withHeaderRow && index === 0 ? "th" : "td";
      return `<tr>${row.map((cell) => cellHtml(cell, tag)).join("")}</tr>`;
    })
    .join("");
  return `<table><tbody>${body}</tbody></table>`;
}
