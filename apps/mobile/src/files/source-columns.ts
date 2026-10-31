const TAB = "  ";

export function expandTabs(text: string) {
  return text.includes("\t") ? text.replaceAll("\t", TAB) : text;
}

export function sourceColumns(lines: readonly string[]) {
  let widest = 0;
  for (const line of lines) {
    if (line.length <= widest) continue;
    const columns = expandTabs(line).length;
    if (columns > widest) widest = columns;
  }
  return widest;
}
